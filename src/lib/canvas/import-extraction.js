/**
 * Canvas Import — Extraction Phase
 *
 * Handles downloading files from Canvas, dedup/claim logic, and
 * delegating to the RAG pipeline for content extraction + embedding.
 * Also houses the per-file SQS handler, direct extraction, and retry logic.
 */

import sql from "../../database/pgsql.js";
import { v4 as uuidv4 } from "uuid";
import { getStorageProvider } from "../storage/init.ts";
import { addNoteToTree } from "../notes/storage/pg-tree.js";
import { CanvasClient } from "./client.js";
import { createAsyncLimiter } from "./async-limiter.js";
import { parseEnvConcurrency } from "./import-metrics.js";
import { processRagPipeline } from "./import-embedding.js";
import { decrypt } from "../crypto.ts";
import logger from "../logger.ts";

// ── Constants ───────────────────────────────────────────────────────────────

export const PROCESSABLE_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "text/markdown",
  "text/x-markdown",
  "text/plain",
]);

const EXT_MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
  md: "text/markdown",
  markdown: "text/markdown",
  txt: "text/plain",
};

export const FILE_TIMEOUT_MS = Math.max(
  60_000,
  Number.parseInt(process.env.CANVAS_FILE_TIMEOUT_MS ?? "", 10) ||
    10 * 60 * 1000,
);
export const FILE_CONCURRENCY = 5;

// ── Concurrency limiters ────────────────────────────────────────────────────

const CANVAS_GLOBAL_FILE_CONCURRENCY = parseEnvConcurrency(
  "CANVAS_GLOBAL_FILE_CONCURRENCY",
  6,
);

const globalFileLimiter = createAsyncLimiter(CANVAS_GLOBAL_FILE_CONCURRENCY);

// ── MIME type resolution ────────────────────────────────────────────────────

export function resolveMimeType(filename, canvasMimeType) {
  if (canvasMimeType && PROCESSABLE_TYPES.has(canvasMimeType))
    return canvasMimeType;
  const ext = filename?.toLowerCase().split(".").pop();
  if (ext && EXT_MIME[ext]) return EXT_MIME[ext];
  return canvasMimeType;
}

// ── Note helpers ────────────────────────────────────────────────────────────

async function createNote(userId, title, parentId, opts = {}) {
  const noteId = uuidv4();
  const s3Key = opts.s3Key ?? null;
  const isFolder = opts.isFolder ?? false;
  const content = opts.content ?? "";
  const canvasCourseId = opts.canvasCourseId ?? null;
  const canvasModuleId = opts.canvasModuleId ?? null;
  const canvasAssignmentId = opts.canvasAssignmentId ?? null;
  const canvasAcademicYear = opts.canvasAcademicYear ?? null;
  await sql`
    INSERT INTO app.notes (
      note_id, user_id, title, content, s3_key, is_folder,
      canvas_course_id, canvas_module_id, canvas_assignment_id, canvas_academic_year,
      created_at, updated_at
    )
    VALUES (
      ${noteId}::uuid, ${userId}::uuid, ${title}, ${content}, ${s3Key}, ${isFolder},
      ${canvasCourseId}, ${canvasModuleId}, ${canvasAssignmentId}, ${canvasAcademicYear},
      NOW(), NOW()
    )
  `;
  await addNoteToTree(userId, noteId, parentId ?? null);
  return noteId;
}

// find an existing note by title under a parent, or create a new one
// handles concurrent inserts by catching unique-violation and re-fetching
async function findOrCreateNote(userId, title, parentId, opts = {}) {
  // SQL `= NULL` is always unknown -- split query for null vs non-null parent
  const existing = parentId
    ? await sql`
        SELECT n.note_id FROM app.notes n
        JOIN app.tree_items t ON t.note_id = n.note_id
        WHERE n.user_id = ${userId}::uuid
          AND t.user_id = ${userId}::uuid
          AND n.title = ${title}
          AND n.is_folder = false
          AND n.deleted_at IS NULL
          AND t.parent_id = ${parentId}::uuid
        LIMIT 1
      `
    : await sql`
        SELECT n.note_id FROM app.notes n
        JOIN app.tree_items t ON t.note_id = n.note_id
        WHERE n.user_id = ${userId}::uuid
          AND t.user_id = ${userId}::uuid
          AND n.title = ${title}
          AND n.is_folder = false
          AND n.deleted_at IS NULL
          AND t.parent_id IS NULL
        LIMIT 1
      `;
  if (existing.length > 0) {
    const noteId = existing[0].note_id;
    // backfill canvas metadata on re-import if not already set
    if (opts.canvasCourseId != null) {
      await sql`
        UPDATE app.notes
        SET canvas_course_id    = COALESCE(canvas_course_id,    ${opts.canvasCourseId}),
            canvas_module_id    = COALESCE(canvas_module_id,    ${opts.canvasModuleId ?? null}),
            canvas_assignment_id = COALESCE(canvas_assignment_id, ${opts.canvasAssignmentId ?? null}),
            updated_at          = NOW()
        WHERE note_id = ${noteId}::uuid AND canvas_course_id IS NULL
      `;
    }
    return { noteId, created: false };
  }
  try {
    const noteId = await createNote(userId, title, parentId, opts);
    return { noteId, created: true };
  } catch (err) {
    // concurrent insert won the race -- re-fetch the winner
    if (err.code === "23505") {
      const [row] = parentId
        ? await sql`
            SELECT n.note_id FROM app.notes n
            JOIN app.tree_items t ON t.note_id = n.note_id
            WHERE n.user_id = ${userId}::uuid
              AND t.user_id = ${userId}::uuid
              AND n.title = ${title}
              AND n.is_folder = false
              AND n.deleted_at IS NULL
              AND t.parent_id = ${parentId}::uuid
            LIMIT 1
          `
        : await sql`
            SELECT n.note_id FROM app.notes n
            JOIN app.tree_items t ON t.note_id = n.note_id
            WHERE n.user_id = ${userId}::uuid
              AND t.user_id = ${userId}::uuid
              AND n.title = ${title}
              AND n.is_folder = false
              AND n.deleted_at IS NULL
              AND t.parent_id IS NULL
            LIMIT 1
          `;
      if (row) return { noteId: row.note_id, created: false };
    }
    throw err;
  }
}

// ── Import record helpers ───────────────────────────────────────────────────

export async function fetchResource(
  fetchFn,
  courseId,
  userId,
  courseTitle,
  kind,
  jobId,
) {
  const { data, forbidden } = await fetchFn(courseId);
  if (forbidden) {
    console.log(`Course ${kind} restricted: ${courseTitle}`);
    await sql`
      INSERT INTO app.canvas_imports (id, user_id, canvas_course_id, canvas_module_id, canvas_file_id, filename, mime_type, status, error_message, job_id)
      VALUES (${uuidv4()}::uuid, ${userId}::uuid, ${courseId}::int, 0, 0, ${courseTitle + " (" + kind + ")"}, 'text/plain', 'forbidden', ${"Course " + kind + " restricted by lecturer"}, ${jobId}::uuid)
    `;
  }
  return { data, forbidden };
}

async function setImportStatus(importRecordId, status, extra = {}) {
  if (extra.noteId) {
    await sql`UPDATE app.canvas_imports SET status = ${status}, note_id = ${extra.noteId}::uuid, updated_at = NOW() WHERE id = ${importRecordId}::uuid`;
  } else if (extra.message !== undefined) {
    await sql`UPDATE app.canvas_imports SET status = ${status}, error_message = ${extra.message}, updated_at = NOW() WHERE id = ${importRecordId}::uuid`;
  } else {
    await sql`UPDATE app.canvas_imports SET status = ${status}, updated_at = NOW() WHERE id = ${importRecordId}::uuid`;
  }
}

export async function isJobCancelled(jobId) {
  if (!jobId) return false;
  const [row] =
    await sql`SELECT status FROM app.canvas_import_jobs WHERE id = ${jobId} LIMIT 1`;
  return row?.status === "cancelled";
}

// ── RAG pipeline wrapper ────────────────────────────────────────────────────
// wraps processRagPipeline to inject findOrCreateNote (avoids circular deps)

async function runRagPipeline(noteId, userId, parentFolderId, buffer, ragOpts) {
  return processRagPipeline(
    noteId,
    userId,
    parentFolderId,
    buffer,
    ragOpts,
    findOrCreateNote,
  );
}

// ── File import ─────────────────────────────────────────────────────────────

async function _runFileImport(importRecordId, file, opts) {
  const {
    userId,
    courseId,
    moduleId,
    parentFolderId,
    client,
    storage,
    s3Prefix,
  } = opts;
  if (await isJobCancelled(opts.jobId)) throw new Error("Job cancelled");
  const resolvedMimeType = resolveMimeType(
    file.display_name,
    file.content_type,
  );

  if (!PROCESSABLE_TYPES.has(resolvedMimeType)) {
    console.log(`Skipped (non-processable): ${file.display_name}`);
    return { skipped: true };
  }

  // atomically check dedup + claim the import slot
  const moduleIdVal = moduleId ?? -1;
  const claimed = await sql.begin(async (tx) => {
    // skip if already successfully imported, indexing, or queued for retry
    const [existing] = await tx`
        SELECT status FROM app.canvas_imports
        WHERE user_id = ${userId}::uuid AND canvas_file_id = ${file.id}::int
          AND status IN ('complete', 'indexing', 'pending_retry')
        LIMIT 1
      `;
    if (existing) return false;

    // upsert: insert new record or reclaim a stale one atomically
    await tx`
      INSERT INTO app.canvas_imports (id, user_id, canvas_course_id, canvas_module_id, canvas_file_id, filename, mime_type, status, job_id)
      VALUES (${importRecordId}::uuid, ${userId}::uuid, ${courseId}::int, ${moduleIdVal}::int, ${file.id}::int, ${file.display_name}, ${resolvedMimeType}, 'downloading', ${opts.jobId ?? null})
      ON CONFLICT (user_id, canvas_file_id)
      DO UPDATE SET status = 'downloading', job_id = ${opts.jobId ?? null},
                    filename = ${file.display_name}, mime_type = ${resolvedMimeType}, created_at = NOW()
      WHERE app.canvas_imports.status NOT IN ('complete', 'indexing', 'pending_retry')
    `;
    return true;
  });
  if (!claimed) {
    console.log(`Already imported or pending, skipping: ${file.display_name}`);
    return { skipped: true };
  }

  const downloadStart = Date.now();
  const { buffer, forbidden: dlForbidden } = await client.downloadFile(
    file.url,
  );
  const downloadElapsedMs = Date.now() - downloadStart;

  if (dlForbidden || !buffer) {
    console.log(`Download forbidden: ${file.display_name}`);
    await setImportStatus(importRecordId, "forbidden", {
      message: "File access denied by lecturer",
    });
    return;
  }

  logger.info("canvas-import-file-downloaded", {
    jobId: opts.jobId,
    filename: file.display_name,
    fileSizeBytes: buffer.length,
    elapsedMs: downloadElapsedMs,
    elapsedSecs: (downloadElapsedMs / 1000).toFixed(2),
  });

  const s3Key = `${s3Prefix}/${file.filename}`;
  await storage.putObject(s3Key, buffer, { contentType: resolvedMimeType });
  await setImportStatus(importRecordId, "processing");

  // resolve canvas metadata: module files have moduleId set; assignment files do not,
  // so look up canvas_assignment_id from the parent assignment folder
  const canvasCourseId = courseId ? Number(courseId) : null;
  const canvasModuleId = moduleId ?? null;
  let canvasAssignmentId = null;
  if (!moduleId && parentFolderId) {
    const [parentFolder] = await sql`
      SELECT canvas_assignment_id FROM app.notes WHERE note_id = ${parentFolderId}::uuid LIMIT 1
    `;
    canvasAssignmentId = parentFolder?.canvas_assignment_id ?? null;
  }

  const { noteId } = await findOrCreateNote(
    userId,
    file.display_name,
    parentFolderId,
    { s3Key, canvasCourseId, canvasModuleId, canvasAssignmentId },
  );

  // create attachment record so the upload GET handler can verify ownership
  await sql`
    INSERT INTO app.attachments (id, note_id, user_id, filename, s3_key, mime_type, file_size)
    VALUES (${uuidv4()}::uuid, ${noteId}::uuid, ${userId}::uuid,
            ${file.display_name}, ${s3Key}, ${resolvedMimeType}, ${buffer.length})
  `;

  await setImportStatus(importRecordId, "indexing", { noteId });

  const ragStart = Date.now();
  const ragResult = await runRagPipeline(
    noteId,
    userId,
    parentFolderId,
    buffer,
    {
      filename: file.display_name,
      mimeType: resolvedMimeType,
      s3Key,
      jobId: opts.jobId,
      canvasCourseId,
      canvasModuleId,
      canvasAssignmentId,
    },
  );
  const ragElapsedMs = Date.now() - ragStart;

  if (ragResult === null) {
    return;
  }

  logger.info("canvas-import-file-processed", {
    jobId: opts.jobId,
    filename: file.display_name,
    ragElapsedMs,
    ragElapsedSecs: (ragElapsedMs / 1000).toFixed(2),
    chunksStored: ragResult.chunksStored,
  });

  if (await isJobCancelled(opts.jobId)) {
    await setImportStatus(importRecordId, "cancelled");
    return;
  }

  await setImportStatus(importRecordId, "complete", { noteId });
  console.log(`Processed: ${file.display_name}`);
}

export async function downloadAndStoreFile(file, opts) {
  const importRecordId = uuidv4();
  try {
    // start the timeout only after the task has acquired a limiter slot.
    // otherwise long queue wait time is incorrectly counted as processing time.
    await globalFileLimiter(async () => {
      let timerId;
      const timer = new Promise((_, reject) => {
        timerId = setTimeout(
          () =>
            reject(
              new Error(
                `File timed out after ${Math.round(FILE_TIMEOUT_MS / 60000)} minutes: ${file.display_name}`,
              ),
            ),
          FILE_TIMEOUT_MS,
        );
      });

      try {
        await Promise.race([_runFileImport(importRecordId, file, opts), timer]);
      } finally {
        clearTimeout(timerId);
      }
    });
  } catch (error) {
    console.error(`File processing error (${file.display_name}):`, error);
    try {
      await sql`
        UPDATE app.canvas_imports
        SET status = 'error', error_message = ${error.message}, updated_at = NOW()
        WHERE id = ${importRecordId}::uuid
      `;
    } catch (dbErr) {
      console.error("Failed to update import record:", dbErr);
    }
  }
}

// ── Job completion check ────────────────────────────────────────────────────

// marks a job complete when all its canvas_imports rows are in terminal states.
// the count check and status update share the same transaction to avoid TOCTOU.
// pending_retry counts as in-flight since the retry queue will eventually resolve it.
async function checkAndCompleteJob(jobId, userId) {
  let weCompleted = false;
  await sql.begin(async (tx) => {
    const [{ count }] = await tx`
      SELECT COUNT(*) as count FROM app.canvas_imports
      WHERE job_id = ${jobId}::uuid
        AND status NOT IN ('complete', 'forbidden', 'error', 'cancelled')
    `;
    if (parseInt(count, 10) > 0) return;

    const rows = await tx`
      SELECT id FROM app.canvas_import_jobs
      WHERE id = ${jobId}::uuid AND status = 'processing'
      FOR UPDATE SKIP LOCKED
    `;
    if (rows.length === 0) return;
    await tx`UPDATE app.canvas_import_jobs SET status = 'complete', completed_at = NOW() WHERE id = ${jobId}`;
    weCompleted = true;
  });

  if (!weCompleted) return;

  console.log(`[${new Date().toISOString()}] Job completed: ${jobId}`);
  try {
    const chunks = await sql`
      SELECT c.id FROM app.chunks c
      JOIN app.canvas_imports ci ON ci.note_id = c.document_id
      WHERE ci.job_id = ${jobId}::uuid AND c.user_id = ${userId}::uuid
    `;
    const chunkIds = chunks.map((r) => r.id);
    if (chunkIds.length > 0) {
      const { seedQuestionsAfterImport } = await import(
        "../quiz/generate-background.ts"
      );
      const seeded = await seedQuestionsAfterImport(userId, chunkIds, 5);
      console.log(`Quiz seed: ${seeded} questions for job ${jobId}`);
    }
  } catch (seedErr) {
    console.warn(`Quiz seed failed (non-fatal): ${seedErr.message}`);
  }
}

// ── Per-file SQS message handler ────────────────────────────────────────────

export async function processCanvasFile({ importRecordId, jobId, userId }) {
  const ts = () => new Date().toISOString();
  console.log(`[${ts()}] Processing canvas file: ${importRecordId}`);
  try {
    const [record] =
      await sql`SELECT * FROM app.canvas_imports WHERE id = ${importRecordId}::uuid`;
    if (!record) {
      console.error(`[${ts()}] Import record not found: ${importRecordId}`);
      return false;
    }

    // idempotency -- SQS at-least-once may redeliver
    if (
      ["complete", "forbidden", "error", "cancelled", "pending_retry"].includes(
        record.status,
      )
    ) {
      console.log(
        `[${ts()}] Record ${importRecordId} already terminal: ${record.status}`,
      );
      return true;
    }

    if (await isJobCancelled(jobId)) {
      await sql`UPDATE app.canvas_imports SET status = 'cancelled', updated_at = NOW() WHERE id = ${importRecordId}::uuid`;
      await checkAndCompleteJob(jobId, userId);
      return false;
    }

    const [creds] =
      await sql`SELECT canvas_token, canvas_domain FROM app.login WHERE user_id = ${userId}`;
    if (!creds) throw new Error("Canvas credentials not found");
    const plainToken = decrypt(creds.canvas_token, userId);
    const client = new CanvasClient(creds.canvas_domain, plainToken);
    const storage = getStorageProvider();

    // re-fetch a fresh download URL -- avoids any session-tied URL expiry between phases
    const { data: file, forbidden: fileForbidden } = await client.getFile(
      String(record.canvas_course_id),
      record.canvas_file_id,
    );
    if (fileForbidden || !file) {
      await setImportStatus(importRecordId, "forbidden", {
        message: "File access denied by lecturer",
      });
      await checkAndCompleteJob(jobId, userId);
      return false;
    }

    await _runFileImport(importRecordId, file, {
      userId,
      courseId: String(record.canvas_course_id),
      moduleId: record.canvas_module_id > 0 ? record.canvas_module_id : null,
      parentFolderId: record.parent_folder_id,
      client,
      storage,
      jobId,
      s3Prefix: record.s3_prefix,
    });

    await checkAndCompleteJob(jobId, userId);
    return true;
  } catch (err) {
    console.error(
      `[${new Date().toISOString()}] Canvas file error (${importRecordId}):`,
      err.message,
    );
    try {
      await sql`
        UPDATE app.canvas_imports
        SET status = 'error', error_message = ${err.message}, updated_at = NOW()
        WHERE id = ${importRecordId}::uuid
          AND status NOT IN ('complete', 'forbidden', 'cancelled')
      `;
    } catch {}
    await checkAndCompleteJob(jobId, userId);
    return false;
  }
}

// ── Direct extraction (from /api/upload) ────────────────────────────────────

export async function processDirectExtraction(msg) {
  const { noteId, userId, s3Key, mimeType, filename } = msg;
  const ts = () => new Date().toISOString();
  console.log(`[${ts()}] Direct extraction for note ${noteId} (${mimeType})`);

  // idempotency: skip if already done (SQS at-least-once can redeliver)
  const [existing] = await sql`
    SELECT status FROM app.ingestion_jobs
    WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
    ORDER BY created_at DESC LIMIT 1
  `;
  if (existing?.status === "done") {
    console.log(`[${ts()}] Note ${noteId} already extracted, skipping`);
    return;
  }

  await sql`
    UPDATE app.ingestion_jobs
    SET status = 'processing', updated_at = NOW()
    WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid AND status = 'pending'
  `;

  const storage = getStorageProvider();
  const buffer = await storage.getObject(s3Key);
  if (!buffer) {
    await sql`
      UPDATE app.ingestion_jobs
      SET status = 'failed', error = 'S3 object not found', updated_at = NOW()
      WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
    `;
    console.error(
      `[${ts()}] S3 object not found for note ${noteId}: ${s3Key}`,
    );
    return;
  }

  try {
    const [treeRow] = await sql`
      SELECT parent_id
      FROM app.tree_items
      WHERE user_id = ${userId}::uuid AND note_id = ${noteId}::uuid
      LIMIT 1
    `;
    const sourceParentId = treeRow?.parent_id ?? null;

    const result = await runRagPipeline(noteId, userId, sourceParentId, buffer, {
      filename: filename ?? s3Key.split("/").pop() ?? "document",
      mimeType,
      s3Key,
    });
    if (!result) {
      await sql`
        UPDATE app.ingestion_jobs
        SET status = 'pending', error = 'Queued for extraction retry', updated_at = NOW()
        WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
      `;
      console.log(
        `[${ts()}] Extraction deferred for note ${noteId}; retry queued`,
      );
      return;
    }

    const chunksStored = result.chunksStored ?? 0;
    await sql`
      UPDATE app.ingestion_jobs
      SET status = 'done', chunks_stored = ${chunksStored}, error = NULL, updated_at = NOW()
      WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
    `;
    console.log(
      `[${ts()}] Direct extraction complete for note ${noteId} (${chunksStored} chunks)`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await sql`
      UPDATE app.ingestion_jobs
      SET status = 'failed', error = ${message}, updated_at = NOW()
      WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
    `;
    console.error(
      `[${ts()}] Direct extraction failed for note ${noteId}: ${message}`,
    );
  }
}

// ── Extraction retry handler ────────────────────────────────────────────────

export async function processExtractionRetry(msg) {
  const {
    noteId,
    userId,
    s3Key,
    filename,
    mimeType,
    parentFolderId,
    attempt,
  } = msg;
  console.log(
    `[${new Date().toISOString()}] Extraction retry for note ${noteId} (attempt ${attempt})`,
  );

  // for retry messages we still allow processing even when already complete,
  // because retries can be used for enrichment/replacement after fallback text.
  const [importRow] =
    await sql`SELECT status FROM app.canvas_imports WHERE note_id = ${noteId}::uuid LIMIT 1`;
  if (importRow?.status === "complete" && (attempt ?? 0) <= 0) {
    console.log(`Note ${noteId} already complete, skipping duplicate retry`);
    return;
  }

  const storage = getStorageProvider();
  const objectData = await storage.getObjectAndMeta(s3Key);
  const buffer = objectData?.buffer;

  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    await sql`
      UPDATE app.canvas_imports
      SET status = 'error', error_message = ${`S3 object missing/empty: ${s3Key}`}, updated_at = NOW()
      WHERE note_id = ${noteId}::uuid
    `;
    return;
  }

  try {
    const result = await runRagPipeline(
      noteId,
      userId,
      parentFolderId,
      buffer,
      {
        filename,
        mimeType,
        s3Key,
        attempt,
      },
    );

    if (result) {
      await sql`
        UPDATE app.ingestion_jobs
        SET status = 'done', chunks_stored = ${result.chunksStored ?? 0}, error = NULL, updated_at = NOW()
        WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
      `;
    } else {
      await sql`
        UPDATE app.ingestion_jobs
        SET status = 'pending', error = 'Queued for extraction retry', updated_at = NOW()
        WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
      `;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await sql`
      UPDATE app.canvas_imports
      SET status = 'error', error_message = ${message}, updated_at = NOW()
      WHERE note_id = ${noteId}::uuid
    `;

    await sql`
      UPDATE app.ingestion_jobs
      SET status = 'failed', error = ${message}, updated_at = NOW()
      WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
    `;

    console.error(
      `[${new Date().toISOString()}] Extraction retry failed for note ${noteId}: ${message}`,
    );
  }
}
