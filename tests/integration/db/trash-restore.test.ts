import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { requireE2EDatabaseUrl } from "../helpers/env";
import appSql from "@/database/pgsql";
import { createNoteWithTree } from "@/lib/notes/storage/create-note";
import {
  moveSubtreeToTrash,
  restoreTrashRoot,
} from "@/lib/notes/storage/note-lifecycle";

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

async function parentOf(noteId: string): Promise<string | null> {
  const [row] = await fixtureSql<{ parent_id: string | null }[]>`
    SELECT parent_id FROM app.tree_items WHERE note_id = ${noteId}::uuid
  `;
  return row?.parent_id ?? null;
}

beforeEach(async () => {
  userId = randomUUID();
  await fixtureSql`
    INSERT INTO app.login (user_id, email, hashed_password, email_verified, is_active)
    VALUES (${userId}::uuid, ${`trash-restore-${userId}@example.test`}, 'unused', true, true)
  `;
});

afterEach(async () => {
  await fixtureSql`DELETE FROM app.login WHERE user_id = ${userId}::uuid`;
});

afterAll(async () => {
  await Promise.all([fixtureSql.end(), appSql.end()]);
});

describe("Trash restore placement", () => {
  it("keeps a restored note in its folder while that folder is live", async () => {
    const folder = await create("Week 1", true);
    const note = await create("Lecture", false, folder);

    await moveSubtreeToTrash(userId, note);
    await expect(restoreTrashRoot(userId, note)).resolves.not.toBeNull();

    expect(await parentOf(note)).toBe(folder);
  });

  it("restores a note to the workspace root when its folder is still in Trash", async () => {
    const folder = await create("Week 1", true);
    const note = await create("Lecture", false, folder);

    // separate bundles: the note first, then the folder that held it
    await moveSubtreeToTrash(userId, note);
    await moveSubtreeToTrash(userId, folder);
    await expect(restoreTrashRoot(userId, note)).resolves.not.toBeNull();

    // the children route only lists live folders' children, so a parent
    // still in Trash would leave the note unreachable from the sidebar
    expect(await parentOf(note)).toBeNull();
    const [restored] = await fixtureSql<{ deleted_at: Date | null }[]>`
      SELECT deleted_at FROM app.notes WHERE note_id = ${note}::uuid
    `;
    expect(restored?.deleted_at).toBeNull();
  });
});
