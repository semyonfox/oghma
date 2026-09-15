import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import sql, { afterDatabaseCommit } from "@/database/pgsql";
import { startCanvasRun, canonicalCanvasCourses } from "@/lib/canvas/import-runs";
import { cancelActiveCanvasImportJobs } from "@/lib/canvas/cancel-import-jobs";
import { withCanvasExecution, withCanvasPublication, CanvasClaimLostError } from "@/lib/canvas/execution";
import { recoverCanvasExecutions } from "@/lib/canvas/execution-recovery";
import { processCanvasFile, processExtractionRetry } from "@/lib/canvas/import-extraction";
import { stageCanvasExtractionRetry } from "@/lib/canvas/extraction-retry";
import { dispatchFairCanvasFiles } from "@/lib/canvas/import-scheduler";
import { findCanvasTrashConflicts, CanvasTrashConflictError } from "@/lib/canvas/trash-conflicts";
import { restoreTrashRoot } from "@/lib/notes/storage/note-lifecycle";
import { replaceNoteEmbeddings } from "@/lib/rag/indexing";
import { captureImportedPdfCache } from "@/lib/canvas/import-cache";

const mocks = vi.hoisted(() => ({
  deleteVectors: vi.fn().mockResolvedValue(undefined), upsertVectors: vi.fn().mockResolvedValue(undefined),
  rag: vi.fn(), enqueue: vi.fn().mockResolvedValue(undefined),
  retry: vi.fn().mockResolvedValue(undefined),
  bytes: Buffer.from("test PDF"), objects: new Map<string, Buffer>(),
}));
vi.mock("@/lib/queue", () => ({
  getCanvasQueueAttemptLimit: () => 3, getMarkerCompletionAttemptLimit: () => 3,
  enqueueCanvasJob: mocks.enqueue, enqueueExtractRetryJob: mocks.retry,
}));
vi.mock("@/lib/canvas/import-embedding", () => ({ processRagPipeline: mocks.rag }));
vi.mock("@/lib/crypto.ts", () => ({ decrypt: () => "disposable-token" }));
vi.mock("@/lib/marketing/events.ts", () => ({ recordActivationMilestone: async () => true }));
vi.mock("@/lib/notes/tree-cache", () => ({ invalidateTreeAfterPublish: async () => undefined }));
vi.mock("@/lib/cache", () => ({ cacheInvalidate: async () => undefined, cacheKeys: { note: () => "test", treeChildren: () => "test", tree: () => "test", treeFull: () => "test", notesList: () => "test" } }));
vi.mock("@/lib/qdrant", () => ({
  getChunkVectors: async () => [], deleteChunkVectors: mocks.deleteVectors,
  upsertChunkVectors: mocks.upsertVectors, setChunkVectorsSearchable: async () => undefined,
}));
vi.mock("@/lib/embeddings", () => ({ embedChunks: async (chunks: string[]) => chunks.map((chunk) => ({ chunk, vector: [0.1, 0.2] })) }));
vi.mock("@/lib/canvas/client", () => ({
  MAX_CANVAS_FILE_BYTES: 1_000_000,
  CanvasClient: class {
    baseUrl = "https://canvas.example.test";
    async getFile() { return { data: { id: "42", display_name: "Lecture.pdf", filename: "Lecture.pdf",
      content_type: "application/pdf", url: "https://canvas.example.test/file", size: mocks.bytes.length,
      updated_at: mocks.bytes.toString("hex") } }; }
    async downloadFile() { return { buffer: mocks.bytes }; }
  },
}));
vi.mock("@/lib/storage/init.ts", () => ({ getStorageProvider: () => ({
  hasObject: async (key: string) => mocks.objects.has(key),
  putObject: async (key: string, bytes: Buffer) => { mocks.objects.set(key, bytes); },
  getObjectAndMeta: async (key: string) => ({ buffer: mocks.objects.get(key) }),
}) }));

const users: string[] = [];
const courses = canonicalCanvasCourses(["42"]);

async function user() {
  const id = randomUUID(); users.push(id);
  await sql`INSERT INTO app.login (user_id, email, hashed_password, canvas_token, canvas_domain)
    VALUES (${id}::uuid, ${`${id}@example.test`}, 'not-a-password', 'disposable-token', 'canvas.example.test')`;
  return id;
}

async function fixture(status = "downloading") {
  const userId = await user(); const jobId = randomUUID(); const importId = randomUUID(); const token = randomUUID();
  await sql`INSERT INTO app.canvas_import_jobs (id, user_id, status, course_ids)
    VALUES (${jobId}::uuid, ${userId}::uuid, 'processing', '["42"]')`;
  await sql`INSERT INTO app.canvas_imports (id, job_id, user_id, status, canvas_course_id, canvas_file_id,
    canvas_module_id, filename, mime_type, s3_prefix, claim_token, claim_expires_at, execution_attempts)
    VALUES (${importId}::uuid, ${jobId}::uuid, ${userId}::uuid, ${status}, 42, 42, -1,
      'Lecture.pdf', 'application/pdf', 'test', ${token}::uuid, NOW() - INTERVAL '1 minute', 1)`;
  return { jobId, userId, importId, token };
}

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

describe("Canvas durable lifecycle with PostgreSQL", () => {
  beforeEach(() => {
    if (!process.env.DATABASE_URL?.includes("e2e")) throw new Error("Disposable e2e database required");
    mocks.objects.clear(); mocks.bytes = Buffer.from(`%PDF-${randomUUID()}`);
    mocks.deleteVectors.mockClear(); mocks.upsertVectors.mockClear();
    mocks.rag.mockReset(); mocks.enqueue.mockClear(); mocks.retry.mockClear();
  });

  afterAll(async () => {
    await sql`DELETE FROM app.canvas_imports WHERE user_id = ANY(${users}::uuid[])`;
    await sql`DELETE FROM app.canvas_import_jobs WHERE user_id = ANY(${users}::uuid[])`;
    await sql`DELETE FROM app.login WHERE user_id = ANY(${users}::uuid[])`;
    await sql.end();
  });

  it("offers the owned Trash bundle and restores the same edited notes without recreating them", async () => {
    const userId = await user(); const rootId = randomUUID(); const noteId = randomUUID();
    await sql`INSERT INTO app.notes (note_id, user_id, title, is_folder, canvas_course_id, deleted_at, trash_root_id)
      VALUES (${rootId}::uuid, ${userId}::uuid, 'Course', TRUE, 42, NOW(), ${rootId}::uuid)`;
    await sql`INSERT INTO app.notes (note_id, user_id, title, content, deleted_at, trash_root_id)
      VALUES (${noteId}::uuid, ${userId}::uuid, 'Edited note', 'My own annotations', NOW(), ${rootId}::uuid)`;
    await sql`INSERT INTO app.tree_items (user_id, note_id, parent_id)
      VALUES (${userId}::uuid, ${rootId}::uuid, NULL), (${userId}::uuid, ${noteId}::uuid, ${rootId}::uuid)`;
    const [conflict] = await findCanvasTrashConflicts(userId, ['42']);
    expect(conflict).toMatchObject({ rootId, title: 'Course' });
    expect(await findCanvasTrashConflicts(await user(), ['42'])).toEqual([]);
    await expect(startCanvasRun({ userId, courses, mode: 'import', checkTrash: true })).rejects.toBeInstanceOf(CanvasTrashConflictError);
    const jobs = await sql`SELECT id FROM app.canvas_import_jobs WHERE user_id = ${userId}::uuid`;
    expect(jobs).toHaveLength(0);
    const restored = await restoreTrashRoot(userId, rootId, conflict.deletedAt);
    expect(restored?.noteIds.sort()).toEqual([rootId, noteId].sort());
    const [note] = await sql`SELECT content, deleted_at FROM app.notes WHERE note_id = ${noteId}::uuid`;
    expect(note).toMatchObject({ content: 'My own annotations', deleted_at: null });
    expect(await findCanvasTrashConflicts(userId, ['42'])).toEqual([]);
    expect((await startCanvasRun({ userId, courses, mode: 'import', checkTrash: true })).kind).toBe('created');
  });

  it("rejects stale restore consent after a newer deletion", async () => {
    const userId = await user(); const rootId = randomUUID();
    await sql`INSERT INTO app.notes (note_id, user_id, title, is_folder, canvas_course_id, deleted_at, trash_root_id)
      VALUES (${rootId}::uuid, ${userId}::uuid, 'Course', TRUE, 42, NOW() - INTERVAL '1 hour', ${rootId}::uuid)`;
    const [conflict] = await findCanvasTrashConflicts(userId, ['42']);
    await sql`UPDATE app.notes SET deleted_at = NOW() WHERE note_id = ${rootId}::uuid`;
    expect(await restoreTrashRoot(userId, rootId, conflict.deletedAt)).toBeNull();
    expect(await findCanvasTrashConflicts(userId, ['42'])).toHaveLength(1);
    // Explicitly keeping Trash, and automatic sync, do not restore the folder.
    expect((await startCanvasRun({ userId, courses, mode: 'sync' })).kind).toBe('created');
    expect(await findCanvasTrashConflicts(userId, ['42'])).toHaveLength(1);
  });

  it("creates one run for simultaneous identical starts and deduplicates large course IDs", async () => {
    const userId = await user();
    const selected = canonicalCanvasCourses(["9007199254740993", "42", { id: "42", name: "Named course" }]);
    const results = await Promise.all(Array.from({ length: 6 }, () => startCanvasRun({ userId, courses: selected, mode: "import" })));
    expect(results.filter((r) => r.kind === "created")).toHaveLength(1);
    const rows = await sql`SELECT course_ids FROM app.canvas_import_jobs WHERE user_id = ${userId}::uuid`;
    expect(rows).toHaveLength(1);
    expect(rows[0].course_ids).toEqual(selected);
    expect(selected.map((c) => c.id)).toEqual(["42", "9007199254740993"]);
  });

  it("requires the observed active ID across import and manual sync", async () => {
    const userId = await user();
    const first = await startCanvasRun({ userId, courses, mode: "import" });
    if (first.kind === "conflict") throw new Error("Unexpected conflict");
    expect((await startCanvasRun({ userId, courses, mode: "sync" })).kind).toBe("conflict");
    const second = await startCanvasRun({ userId, courses, mode: "sync", expectedActiveJobId: first.jobId });
    expect(second.kind).toBe("created");
    const stale = await startCanvasRun({ userId, courses, mode: "import", expectedActiveJobId: first.jobId });
    expect(stale.kind).toBe("conflict");
  });

  it.each(["downloading", "processing", "indexing"])("recovers abandoned %s and rejects late publication", async (state) => {
    const owner = await fixture(state);
    await recoverCanvasExecutions(true);
    const [file] = await sql`SELECT status, claim_token FROM app.canvas_imports WHERE id = ${owner.importId}::uuid`;
    expect(file).toMatchObject({ status: "pending", claim_token: null });
    let published = false;
    await expect(withCanvasExecution(owner, () => withCanvasPublication(async () => { published = true; })))
      .rejects.toBeInstanceOf(CanvasClaimLostError);
    expect(published).toBe(false);
  });

  it("does not reclaim a publication that already holds the ownership lock", async () => {
    const owner = await fixture(); const entered = barrier(); const finish = barrier();
    const publication = withCanvasExecution(owner, () => withCanvasPublication(async () => {
      entered.release(); await finish.promise;
      await sql`UPDATE app.canvas_imports SET status = 'complete' WHERE id = ${owner.importId}::uuid`;
    }));
    await entered.promise;
    expect(await recoverCanvasExecutions(true)).not.toContain(owner.jobId);
    finish.release(); await publication;
    const [file] = await sql`SELECT status FROM app.canvas_imports WHERE id = ${owner.importId}::uuid`;
    expect(file.status).toBe("complete");
  });

  it("rolls back nested note publication on failure and fences cancellation", async () => {
    const owner = await fixture(); const noteId = randomUUID();
    await expect(withCanvasExecution(owner, () => withCanvasPublication(async () => {
      await sql.begin(async (tx) => {
        await tx`INSERT INTO app.notes (note_id, user_id, title) VALUES (${noteId}::uuid, ${owner.userId}::uuid, 'Nested')`;
      });
      throw new Error("publication failed");
    }))).rejects.toThrow("publication failed");
    expect(await sql`SELECT note_id FROM app.notes WHERE note_id = ${noteId}::uuid`).toHaveLength(0);
    await sql.begin((tx) => cancelActiveCanvasImportJobs(tx, owner.userId, "Stopped by user"));
    await expect(withCanvasExecution(owner, () => withCanvasPublication(async () => undefined)))
      .rejects.toBeInstanceOf(CanvasClaimLostError);
  });

  it("bounds recovery and leaves a retryable error instead of an active child", async () => {
    const owner = await fixture();
    await sql`UPDATE app.canvas_imports SET execution_attempts = 3 WHERE id = ${owner.importId}::uuid`;
    await recoverCanvasExecutions(true);
    const [row] = await sql`SELECT status, retryable FROM app.canvas_imports WHERE id = ${owner.importId}::uuid`;
    expect(row).toMatchObject({ status: "error", retryable: true });
  });

  it("recovers a claim after the owning subprocess is killed", async () => {
    const owner = await fixture();
    const script = `
      import sql from './src/database/pgsql.ts';
      import { withCanvasExecution } from './src/lib/canvas/execution.ts';
      const owner = ${JSON.stringify(owner)};
      await withCanvasExecution(owner, async () => {
        await sql\`UPDATE app.canvas_imports SET claim_expires_at = NOW() + INTERVAL '5 minutes' WHERE id = \${owner.importId}::uuid\`;
        process.stdout.write('claimed');
        await new Promise(() => {});
      });
    `;
    const child = spawn(process.execPath, ["--import=tsx", "--input-type=module", "-e", script], { stdio: ["ignore", "pipe", "pipe"] });
    try {
      await Promise.race([
        once(child.stdout, "data"),
        once(child, "exit").then(() => { throw new Error("Test worker exited before claiming"); }),
      ]);
      const exited = once(child, "exit");
      child.kill("SIGKILL"); await exited;
      await sql`UPDATE app.canvas_imports SET claim_expires_at = NOW() - INTERVAL '1 second' WHERE id = ${owner.importId}::uuid`;
      await recoverCanvasExecutions(true);
      const [row] = await sql`SELECT status, claim_token FROM app.canvas_imports WHERE id = ${owner.importId}::uuid`;
      expect(row).toMatchObject({ status: "pending", claim_token: null });
    } finally { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); }
  });

  it("recovers discovery ownership and refuses the original walk's writes", async () => {
    const owner = await fixture("pending");
    await sql`UPDATE app.canvas_import_jobs SET status = 'discovering', claim_token = ${owner.token}::uuid,
      claim_expires_at = NOW() - INTERVAL '1 second', execution_attempts = 1 WHERE id = ${owner.jobId}::uuid`;
    await recoverCanvasExecutions(true);
    const [job] = await sql`SELECT status, claim_token FROM app.canvas_import_jobs WHERE id = ${owner.jobId}::uuid`;
    expect(job).toMatchObject({ status: "queued", claim_token: null });
    await expect(withCanvasExecution({ jobId: owner.jobId, userId: owner.userId, token: owner.token },
      () => withCanvasPublication(async () => undefined))).rejects.toBeInstanceOf(CanvasClaimLostError);
  });

  it("settles legacy active children left behind a failed parent", async () => {
    const owner = await fixture("pending");
    await sql`UPDATE app.canvas_import_jobs SET status = 'failed' WHERE id = ${owner.jobId}::uuid`;
    await recoverCanvasExecutions(true);
    const [row] = await sql`SELECT status, retryable FROM app.canvas_imports WHERE id = ${owner.importId}::uuid`;
    expect(row).toMatchObject({ status: "error", retryable: true });
  });

  it("keeps the old search index and cleans new vectors if a later publication step rolls back", async () => {
    const owner = await fixture(); const noteId = randomUUID();
    await sql`INSERT INTO app.notes (note_id, user_id, title, content)
      VALUES (${noteId}::uuid, ${owner.userId}::uuid, 'Before', 'old content')`;
    const [old] = await sql`INSERT INTO app.chunks (document_id, user_id, text)
      VALUES (${noteId}::uuid, ${owner.userId}::uuid, 'old chunk') RETURNING id`;
    await expect(withCanvasExecution(owner, () => withCanvasPublication(async () => {
      await replaceNoteEmbeddings(noteId, owner.userId, ['new chunk']);
      expect(mocks.deleteVectors).not.toHaveBeenCalled();
      throw new Error("Later cache publication failed");
    }))).rejects.toThrow("Later cache publication failed");
    const rows = await sql`SELECT id, text FROM app.chunks WHERE document_id = ${noteId}::uuid`;
    expect(rows).toEqual([expect.objectContaining({ id: old.id, text: 'old chunk' })]);
    const uploaded = mocks.upsertVectors.mock.calls[0][0];
    expect(mocks.deleteVectors).toHaveBeenCalledWith(uploaded.map((point: { chunkId: string }) => point.chunkId));
    expect(mocks.deleteVectors).not.toHaveBeenCalledWith([old.id]);
  });

  it("defers publication effects until commit and discards them on rollback", async () => {
    const owner = await fixture(); const effect = vi.fn();
    await withCanvasExecution(owner, () => withCanvasPublication(async () => {
      await afterDatabaseCommit(async () => { effect(); });
      expect(effect).not.toHaveBeenCalled();
    }));
    expect(effect).toHaveBeenCalledTimes(1);
    await expect(withCanvasExecution(owner, () => withCanvasPublication(async () => {
      await afterDatabaseCommit(async () => { effect(); });
      throw new Error("rollback");
    }))).rejects.toThrow("rollback");
    expect(effect).toHaveBeenCalledTimes(1);
  });

  it("observes expired claims without changing them until recovery is enabled", async () => {
    const owner = await fixture();
    expect(await recoverCanvasExecutions(false)).toEqual([]);
    const [row] = await sql`SELECT status, claim_token FROM app.canvas_imports WHERE id = ${owner.importId}::uuid`;
    expect(row).toMatchObject({ status: "downloading", claim_token: owner.token });
  });

  it("settles children of stopped jobs as stopped rather than retryable failures", async () => {
    const owner = await fixture("pending_retry");
    await sql`UPDATE app.canvas_import_jobs SET status = 'cancelled' WHERE id = ${owner.jobId}::uuid`;
    await recoverCanvasExecutions(true);
    const [row] = await sql`SELECT status, retryable FROM app.canvas_imports WHERE id = ${owner.importId}::uuid`;
    expect(row).toMatchObject({ status: "cancelled", retryable: false });
  });

  it("does not restart initial processing after the extraction retry budget is exhausted", async () => {
    const owner = await fixture("indexing");
    await sql`UPDATE app.canvas_imports SET retry_attempts = 4 WHERE id = ${owner.importId}::uuid`;
    await recoverCanvasExecutions(true);
    const [row] = await sql`SELECT status, retryable FROM app.canvas_imports WHERE id = ${owner.importId}::uuid`;
    expect(row).toMatchObject({ status: "error", retryable: true });
  });

  it("rejects early and stale retry deliveries without touching storage or processing", async () => {
    const owner = await fixture(); const noteId = randomUUID();
    await sql`INSERT INTO app.notes (note_id, user_id, title, s3_key) VALUES (${noteId}::uuid, ${owner.userId}::uuid, 'Retry', 'test')`;
    await sql`UPDATE app.canvas_imports SET note_id = ${noteId}::uuid WHERE id = ${owner.importId}::uuid`;
    const message = { noteId, userId: owner.userId, s3Key: "test", filename: "Lecture.pdf", mimeType: "application/pdf",
      parentFolderId: null, attempt: 0, importRecordId: owner.importId, jobId: owner.jobId };
    await withCanvasExecution(owner, () => stageCanvasExtractionRetry(message, "Temporary failure"));
    const [row] = await sql`SELECT retry_seq, retry_attempts, next_attempt_at FROM app.canvas_imports WHERE id = ${owner.importId}::uuid`;
    expect(row.retry_seq).toBe(1); expect(row.retry_attempts).toBe(0);
    await processExtractionRetry({ ...message, retrySeq: 1 });
    await sql`UPDATE app.canvas_imports SET next_attempt_at = NOW() - INTERVAL '1 second' WHERE id = ${owner.importId}::uuid`;
    await processExtractionRetry({ ...message, retrySeq: 0 });
    expect(mocks.rag).not.toHaveBeenCalled();
    const [unchanged] = await sql`SELECT status, retry_attempts FROM app.canvas_imports WHERE id = ${owner.importId}::uuid`;
    expect(unchanged).toMatchObject({ status: "pending_retry", retry_attempts: 0 });
  });

  it("retries only failed files as a new run and keeps the old summary", async () => {
    const owner = await fixture("error");
    await sql`UPDATE app.canvas_imports SET retryable = TRUE WHERE id = ${owner.importId}::uuid`;
    const completeId = randomUUID();
    await sql`INSERT INTO app.canvas_imports (id, user_id, job_id, status, canvas_file_id)
      VALUES (${completeId}::uuid, ${owner.userId}::uuid, ${owner.jobId}::uuid, 'complete', 43)`;
    await sql`UPDATE app.canvas_import_jobs SET status = 'complete' WHERE id = ${owner.jobId}::uuid`;
    const result = await startCanvasRun({ userId: owner.userId, courses, mode: "retry", sourceJobId: owner.jobId });
    expect(result.kind).toBe("created");
    const [complete] = await sql`SELECT job_id, status FROM app.canvas_imports WHERE id = ${completeId}::uuid`;
    expect(complete).toMatchObject({ job_id: owner.jobId, status: "complete" });
    const [old] = await sql`SELECT result_summary FROM app.canvas_import_jobs WHERE id = ${owner.jobId}::uuid`;
    expect(old.result_summary).toMatchObject({ imported: 1, failed: 1 });
  });

  it("joins the first user's asynchronous PDF extraction and replays it into a separate note", async () => {
    const first = await fixture("pending"); const second = await fixture("pending");
    mocks.rag.mockImplementation(async (noteId: string, _user: string, _folder: unknown, _bytes: unknown, options: { importRecordId: string }) => {
      await withCanvasPublication(() => sql`UPDATE app.canvas_imports SET status = 'pending_marker'
        WHERE id = ${options.importRecordId}::uuid`);
      return { noteId, chunksStored: 0, pendingMarker: true };
    });
    await Promise.all([first, second].map((owner) => processCanvasFile({ importRecordId: owner.importId, jobId: owner.jobId, userId: owner.userId })));
    expect(mocks.rag).toHaveBeenCalledTimes(1);
    const files = await sql`SELECT id, status, imported_file_cache_id FROM app.canvas_imports
      WHERE id = ANY(${[first.importId, second.importId]}::uuid[])`;
    expect(files.map((r) => r.status).sort()).toEqual(["pending_cache", "pending_marker"]);
    expect(files[0].imported_file_cache_id).toBe(files[1].imported_file_cache_id);
    const waiter = files.find((r) => r.status === "pending_cache")!;
    const owner = waiter.id === first.importId ? first : second;
    await sql`UPDATE app.imported_file_cache SET status = 'ready', replayable = TRUE,
      extracted_markdown = '# Shared extraction', extracted_text = 'Shared extraction'
      WHERE id = ${waiter.imported_file_cache_id}::uuid`;
    await dispatchFairCanvasFiles(1);
    await processCanvasFile({ importRecordId: owner.importId, jobId: owner.jobId, userId: owner.userId });
    expect(mocks.rag).toHaveBeenCalledTimes(1);
    const [done] = await sql`SELECT status, note_id FROM app.canvas_imports WHERE id = ${owner.importId}::uuid`;
    expect(done.status).toBe("complete");
    const [note] = await sql`SELECT user_id, content, imported_file_cache_id FROM app.notes WHERE note_id = ${done.note_id}::uuid`;
    expect(note).toMatchObject({ user_id: owner.userId, content: "# Shared extraction", imported_file_cache_id: waiter.imported_file_cache_id });
    expect(mocks.objects.size).toBe(1);
    await sql`UPDATE app.notes SET content = 'Personal edits' WHERE note_id = ${done.note_id}::uuid`;
    await captureImportedPdfCache({ cacheId: waiter.imported_file_cache_id, sourceNoteId: done.note_id });
    const [cache] = await sql`SELECT extracted_markdown FROM app.imported_file_cache WHERE id = ${waiter.imported_file_cache_id}::uuid`;
    expect(cache.extracted_markdown).toBe("# Shared extraction");
  });
});
