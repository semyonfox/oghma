import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { requireE2EDatabaseUrl } from "../helpers/env";
import appSql from "@/database/pgsql";
import { createNoteWithTree } from "@/lib/notes/storage/create-note";
import { permanentlyDeleteNotes } from "@/lib/notes/storage/note-lifecycle";

// external cleanup runs after commit and is retried by its own journal; this
// test is about the relational delete, which used to fail outright
vi.mock("@/lib/qdrant", () => ({
  deleteChunkVectors: vi.fn().mockResolvedValue(undefined),
  setChunkVectorsSearchable: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/storage/init", () => ({
  getStorageProvider: () => ({
    deleteObject: vi.fn().mockResolvedValue(undefined),
    deletePrefix: vi.fn().mockResolvedValue(undefined),
  }),
}));

const fixtureSql = postgres(requireE2EDatabaseUrl(), { max: 2 });
let userId: string;

async function create(title: string, isFolder: boolean, parentId: string | null = null) {
  const note = await createNoteWithTree({
    noteId: randomUUID(),
    userId,
    title,
    content: isFolder ? "" : "# Body",
    isFolder,
    parentId,
  });
  return note.noteId;
}

beforeEach(async () => {
  userId = randomUUID();
  await fixtureSql`
    INSERT INTO app.login (user_id, email, hashed_password, email_verified, is_active)
    VALUES (${userId}::uuid, ${`permanent-delete-${userId}@example.test`}, 'unused', true, true)
  `;
});

afterEach(async () => {
  await fixtureSql`DELETE FROM app.canvas_imports WHERE user_id = ${userId}::uuid`;
  await fixtureSql`DELETE FROM app.canvas_import_jobs WHERE user_id = ${userId}::uuid`;
  await fixtureSql`DELETE FROM app.note_deletion_cleanup_tasks WHERE user_id = ${userId}::uuid`;
  await fixtureSql`DELETE FROM app.tree_items WHERE user_id = ${userId}::uuid`;
  await fixtureSql`DELETE FROM app.notes WHERE user_id = ${userId}::uuid`;
  await fixtureSql`DELETE FROM app.login WHERE user_id = ${userId}::uuid`;
});

afterAll(async () => {
  await Promise.all([fixtureSql.end(), appSql.end()]);
});

describe("permanentlyDeleteNotes against the real schema", () => {
  // every statement in the delete transaction must name real columns: one bad
  // column made trash purge, empty trash and clear vault fail for every user
  it("removes a folder and its notes and detaches a later import that lived under it", async () => {
    const folder = await create("Week 1", true);
    const first = await create("Lecture 1", false, folder);
    const second = await create("Lecture 2", false, folder);
    const kept = await create("Kept note", false);

    const jobId = randomUUID();
    const importId = randomUUID();
    await fixtureSql`
      INSERT INTO app.canvas_import_jobs (id, user_id, type, status, course_ids)
      VALUES (${jobId}::uuid, ${userId}::uuid, 'canvas', 'complete', '["42"]')
    `;
    await fixtureSql`
      INSERT INTO app.canvas_imports (id, job_id, user_id, status, canvas_course_id, canvas_file_id,
        canvas_module_id, filename, mime_type, s3_prefix, note_id, parent_folder_id)
      VALUES (${importId}::uuid, ${jobId}::uuid, ${userId}::uuid, 'complete', 42, 4242, -1,
        'Kept.pdf', 'application/pdf', 'test', ${kept}::uuid, ${folder}::uuid)
    `;

    const result = await permanentlyDeleteNotes(userId, [folder, first, second]);

    expect([...result.noteIds].sort()).toEqual([folder, first, second].sort());
    const remaining = await fixtureSql<{ note_id: string }[]>`
      SELECT note_id FROM app.notes WHERE user_id = ${userId}::uuid
    `;
    expect(remaining.map((row) => row.note_id)).toEqual([kept]);
    const treeRows = await fixtureSql<{ note_id: string }[]>`
      SELECT note_id FROM app.tree_items WHERE user_id = ${userId}::uuid
    `;
    expect(treeRows.map((row) => row.note_id)).toEqual([kept]);
    const [importRow] = await fixtureSql<{ parent_folder_id: string | null }[]>`
      SELECT parent_folder_id FROM app.canvas_imports WHERE id = ${importId}::uuid
    `;
    expect(importRow.parent_folder_id).toBeNull();
  });

  it("ignores ids owned by another account", async () => {
    const mine = await create("Mine", false);
    const result = await permanentlyDeleteNotes(randomUUID(), [mine]);

    expect(result.noteIds).toEqual([]);
    const [row] = await fixtureSql`SELECT note_id FROM app.notes WHERE note_id = ${mine}::uuid`;
    expect(row).toBeDefined();
  });
});
