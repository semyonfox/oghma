import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/session", () => ({ validateSession: vi.fn(), validateSessionLite: vi.fn() }));
const auth = vi.hoisted(() => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/api-error", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api-error")>(),
  requireAuth: auth.requireAuth,
}));
import { requireE2EDatabaseUrl } from "../helpers/env";

vi.mock("@/lib/rag/indexing", () => ({
  replaceNoteEmbeddings: vi.fn().mockResolvedValue(1),
}));
vi.mock("@/lib/queue", () => ({
  enqueueNoteReindexJob: vi.fn().mockResolvedValue(undefined),
}));

import sql from "@/database/pgsql";
import { PUT } from "@/app/api/notes/[id]/route";
import { enqueueNoteReindexJob } from "@/lib/queue";
import { replaceNoteEmbeddings } from "@/lib/rag/indexing";
import { clearReindexRequest, reindexNote, recoverNoteReindexes } from "@/lib/rag/note-reindex";

const fixture = postgres(requireE2EDatabaseUrl(), { max: 1 });
const userId = randomUUID();
const noteId = randomUUID();

beforeEach(async () => {
  vi.clearAllMocks();
  await fixture`
    INSERT INTO app.login (user_id, email, hashed_password, email_verified, is_active)
    VALUES (${userId}::uuid, ${`note-reindex-${userId}@example.test`}, 'unused', true, true)
  `;
  // a stamp with sub-millisecond digits, like every NOW() written by a save
  await fixture`
    INSERT INTO app.notes (note_id, user_id, title, content, is_folder, updated_at)
    VALUES (${noteId}::uuid, ${userId}::uuid, 'Reindex', '# Title\n\nBody worth indexing.', false,
      '2026-11-06 00:04:00.819954+00')
  `;
});

afterEach(async () => {
  await fixture`DELETE FROM app.login WHERE user_id = ${userId}::uuid`;
});

afterAll(async () => {
  await Promise.all([fixture.end(), sql.end()]);
});

describe("note reindex stamp", () => {
  it("lets an import that indexed a body clear its own request without moving the fence", async () => {
    const [before] = await fixture`UPDATE app.notes SET reindex_requested_at = NOW()
      WHERE note_id = ${noteId}::uuid RETURNING content, updated_at::text AS stamp`;
    await clearReindexRequest(noteId, userId, "an older body");
    const [kept] = await fixture`SELECT reindex_requested_at FROM app.notes WHERE note_id = ${noteId}::uuid`;
    expect(kept.reindex_requested_at).not.toBeNull();
    await clearReindexRequest(noteId, userId, before.content);
    const [after] = await fixture`SELECT reindex_requested_at, updated_at::text AS stamp FROM app.notes WHERE note_id = ${noteId}::uuid`;
    expect(after.reindex_requested_at).toBeNull();
    expect(after.stamp).toBe(before.stamp);
  });
  it("stamps explicit timestamp assignments even when the assigned value is unchanged", async () => {
    const [before] = await fixture`SELECT updated_at::text AS stamp FROM app.notes WHERE note_id = ${noteId}::uuid`;
    const [after] = await fixture`UPDATE app.notes SET extracted_text = 'derived', updated_at = updated_at
      WHERE note_id = ${noteId}::uuid RETURNING updated_at::text AS stamp`;
    expect(after.stamp).not.toBe(before.stamp);
  });
  it("keeps a newer request when content changes during indexing", async () => {
    vi.mocked(replaceNoteEmbeddings).mockImplementationOnce(async () => {
      await fixture`UPDATE app.notes SET content = 'intervening content', reindex_requested_at = NOW(), updated_at = NOW()
        WHERE note_id = ${noteId}::uuid`;
      return 1;
    });
    expect(await reindexNote(noteId, userId)).toBe("stale");
    const [row] = await fixture`SELECT content, reindex_requested_at FROM app.notes WHERE note_id = ${noteId}::uuid`;
    expect(row.content).toBe("intervening content");
    expect(row.reindex_requested_at).not.toBeNull();
    expect(enqueueNoteReindexJob).toHaveBeenCalledWith(noteId, userId);
  });
  it("bounds each recovery pass to 100 publications", async () => {
    await fixture`INSERT INTO app.notes (user_id, title, content, is_folder, reindex_requested_at)
      SELECT ${userId}::uuid, 'recovery bound', 'body', false, '2000-01-01'::timestamptz
      FROM generate_series(1, 101)`;
    await recoverNoteReindexes();
    expect(vi.mocked(enqueueNoteReindexJob).mock.calls.length).toBeLessThanOrEqual(100);
    expect(vi.mocked(enqueueNoteReindexJob).mock.calls.length).toBeGreaterThan(0);
  });
  it("recovers a lost publication and clears matching indexed and unchanged markers", async () => {
    await fixture`UPDATE app.notes SET reindex_requested_at = NOW() - INTERVAL '3 minutes'
      WHERE note_id = ${noteId}::uuid`;
    await recoverNoteReindexes();
    expect(enqueueNoteReindexJob).toHaveBeenCalledWith(noteId, userId);
    await expect(reindexNote(noteId, userId)).resolves.toBe("indexed");
    let [row] = await fixture`SELECT reindex_requested_at FROM app.notes WHERE note_id = ${noteId}::uuid`;
    expect(row.reindex_requested_at).toBeNull();
    await fixture`UPDATE app.notes SET reindex_requested_at = NOW() - INTERVAL '3 minutes'
      WHERE note_id = ${noteId}::uuid`;
    await expect(reindexNote(noteId, userId)).resolves.toBe("unchanged");
    [row] = await fixture`SELECT reindex_requested_at FROM app.notes WHERE note_id = ${noteId}::uuid`;
    expect(row.reindex_requested_at).toBeNull();
  });
  it("does not recover fresh or deleted notes", async () => {
    await fixture`UPDATE app.notes SET reindex_requested_at = NOW() WHERE note_id = ${noteId}::uuid`;
    await recoverNoteReindexes();
    expect(enqueueNoteReindexJob).not.toHaveBeenCalledWith(noteId, userId);
    await fixture`UPDATE app.notes SET reindex_requested_at = NOW() - INTERVAL '3 minutes', deleted_at = NOW()
      WHERE note_id = ${noteId}::uuid`;
    await recoverNoteReindexes();
    expect(enqueueNoteReindexJob).not.toHaveBeenCalledWith(noteId, userId);
  });
  it("keeps the save fence through indexing but rejects intervening content", async () => {
    auth.requireAuth.mockResolvedValue({ user_id: userId });
    const save = (content: string, expectedUpdatedAt?: string) => PUT(
      new NextRequest(`http://localhost/api/notes/${noteId}`, {
        method: "PUT",
        headers: { origin: "http://localhost", "content-type": "application/json" },
        body: JSON.stringify({ content, expectedUpdatedAt }),
      }),
      { params: Promise.resolve({ id: noteId }) },
    );
    const first = await save("first content");
    expect(first.status).toBe(200);
    const { updatedAt } = await first.json();
    await expect(reindexNote(noteId, userId)).resolves.toBe("indexed");
    expect((await save("second content", updatedAt)).status).toBe(200);
    expect((await save("stale content", updatedAt)).status).toBe(409);
  });
  it("stamps an unchanged note whose updated_at has microseconds", async () => {
    await expect(reindexNote(noteId, userId)).resolves.toBe("indexed");
    expect(enqueueNoteReindexJob).not.toHaveBeenCalled();

    const [row] = await fixture<{ extracted_text: string | null }[]>`
      SELECT extracted_text FROM app.notes WHERE note_id = ${noteId}::uuid
    `;
    expect(row.extracted_text).toBeTruthy();
  });
});
