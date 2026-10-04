import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { requireE2EDatabaseUrl } from "../helpers/env";
import appSql from "@/database/pgsql";
import {
  createNoteWithTree,
  insertNoteWithTree,
  InvalidNoteParentError,
} from "@/lib/notes/storage/create-note";

const fixtureSql = postgres(requireE2EDatabaseUrl(), { max: 2 });
let userId: string;
let otherUserId: string;

function input(overrides: Partial<Parameters<typeof createNoteWithTree>[0]> = {}) {
  return {
    noteId: randomUUID(),
    userId,
    title: "Lecture notes",
    content: "# Lecture",
    isFolder: false,
    ...overrides,
  };
}

async function storedRows(noteId: string) {
  const notes = await fixtureSql`
    SELECT note_id FROM app.notes WHERE note_id = ${noteId}::uuid
  `;
  const tree = await fixtureSql`
    SELECT note_id FROM app.tree_items WHERE note_id = ${noteId}::uuid
  `;
  return { notes: notes.length, tree: tree.length };
}

beforeEach(async () => {
  userId = randomUUID();
  otherUserId = randomUUID();
  for (const id of [userId, otherUserId]) {
    await fixtureSql`
      INSERT INTO app.login (user_id, email, hashed_password, email_verified, is_active)
      VALUES (${id}::uuid, ${`note-create-${id}@example.test`}, 'unused', true, true)
    `;
  }
});

afterEach(async () => {
  await fixtureSql`
    DELETE FROM app.login WHERE user_id IN (${userId}::uuid, ${otherUserId}::uuid)
  `;
});

afterAll(async () => {
  await Promise.all([fixtureSql.end(), appSql.end()]);
});

describe("shared note creation", () => {
  it("persists root and child notes with one tree row each", async () => {
    const folder = await createNoteWithTree(input({ isFolder: true, content: "" }));
    const childInput = input({ parentId: folder.noteId, s3Key: "test/lecture.pdf" });
    const child = await createNoteWithTree(childInput);

    expect(child).toMatchObject({
      noteId: childInput.noteId,
      userId,
      title: "Lecture notes",
      content: "# Lecture",
      isFolder: false,
      s3Key: "test/lecture.pdf",
    });
    expect(child.createdAt).toBeInstanceOf(Date);
    expect(child.updatedAt).toBeInstanceOf(Date);
    expect(await storedRows(folder.noteId)).toEqual({ notes: 1, tree: 1 });
    expect(await storedRows(child.noteId)).toEqual({ notes: 1, tree: 1 });
    const tree = await fixtureSql`
      SELECT note_id, parent_id FROM app.tree_items WHERE user_id = ${userId}::uuid
    `;
    expect(tree).toEqual(expect.arrayContaining([
      expect.objectContaining({ note_id: folder.noteId, parent_id: null }),
      expect.objectContaining({ note_id: child.noteId, parent_id: folder.noteId }),
    ]));
  });

  it.each(["missing", "trashed", "non-folder", "other-user"])(
    "rejects a %s parent without persisting the child",
    async (kind) => {
      const parentId = randomUUID();
      if (kind !== "missing") {
        await createNoteWithTree(input({
          noteId: parentId,
          userId: kind === "other-user" ? otherUserId : userId,
          isFolder: kind !== "non-folder",
        }));
      }
      if (kind === "trashed") {
        await fixtureSql`
          UPDATE app.notes SET deleted_at = NOW() WHERE note_id = ${parentId}::uuid
        `;
      }
      const childInput = input({ parentId });

      await expect(createNoteWithTree(childInput)).rejects.toBeInstanceOf(InvalidNoteParentError);
      expect(await storedRows(childInput.noteId)).toEqual({ notes: 0, tree: 0 });
    },
  );

  it("keeps the original note and tree when an optimistic ID is submitted twice", async () => {
    const first = input();
    await createNoteWithTree(first);

    await expect(createNoteWithTree({ ...first, title: "Replacement" }))
      .rejects.toMatchObject({ code: "23505" });

    expect(await storedRows(first.noteId)).toEqual({ notes: 1, tree: 1 });
    const [note] = await fixtureSql`
      SELECT title FROM app.notes WHERE note_id = ${first.noteId}::uuid
    `;
    expect(note.title).toBe(first.title);
  });

  it("rolls back both rows when an adjacent write in the caller's transaction fails", async () => {
    const noteInput = input();
    const failure = new Error("adjacent write failed");

    await expect(appSql.begin(async (tx) => {
      await insertNoteWithTree(tx, noteInput);
      throw failure;
    })).rejects.toBe(failure);

    expect(await storedRows(noteInput.noteId)).toEqual({ notes: 0, tree: 0 });
  });

  it("waits for the user-tree lock and rechecks a parent that enters Trash", async () => {
    const parent = await createNoteWithTree(input({ isFolder: true }));
    const childInput = input({ parentId: parent.noteId });
    let creation: ReturnType<typeof createNoteWithTree> | undefined;

    try {
      await fixtureSql.begin(async (tx) => {
        const [{ pid }] = await tx<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        await tx`
          SELECT pg_advisory_xact_lock(hashtextextended(${userId}::text, 0))
        `;
        await tx`
          UPDATE app.notes SET deleted_at = NOW() WHERE note_id = ${parent.noteId}::uuid
        `;
        creation = createNoteWithTree(childInput);
        // Observe failure below after committing the competing Trash write.
        void creation.catch(() => undefined);

        // Checking an actual lock wait avoids a race based on arbitrary sleeps.
        await expect.poll(async () => {
          const blocked = await fixtureSql`
            SELECT pid FROM pg_stat_activity
            WHERE ${pid}::int = ANY(pg_blocking_pids(pid))
              AND wait_event = 'advisory'
          `;
          return blocked.length;
        }, { timeout: 5_000 }).toBe(1);
      });

      await expect(creation).rejects.toBeInstanceOf(InvalidNoteParentError);
      expect(await storedRows(childInput.noteId)).toEqual({ notes: 0, tree: 0 });
    } finally {
      // Let any in-flight creation settle before fixture cleanup on assertion failure.
      await creation?.catch(() => undefined);
    }
  });
});
