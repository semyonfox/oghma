import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const sql = Object.assign(vi.fn(), {
    begin: vi.fn(
      async (callback: (transaction: typeof sql) => unknown) => callback(sql),
    ),
  });
  return { sql };
});

vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));

import {
  restoreNote,
  softDeleteNote,
} from "@/lib/notes/storage/note-lifecycle";

function queryText(call: unknown[]): string {
  return (call[0] as TemplateStringsArray).join(" ");
}

describe("note trash lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sql.begin.mockImplementation(
      async (callback: (transaction: typeof mocks.sql) => unknown) =>
        callback(mocks.sql),
    );
  });

  it("soft-deletes and restores a note at its active saved parent", async () => {
    mocks.sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { note_id: "note-1", is_folder: false },
      ])
      .mockResolvedValueOnce([{ parent_id: "folder-1" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          note_id: "note-1",
          parent_id: "folder-1",
        },
      ])
      .mockResolvedValueOnce([{ note_id: "folder-1" }])
      .mockResolvedValueOnce([{ note_id: "note-1", is_folder: false }])
      .mockResolvedValueOnce([]);

    await expect(softDeleteNote("user-1", "note-1")).resolves.toEqual({
      parentId: "folder-1",
      previousParentId: "folder-1",
      affectedFolderIds: [],
      affectedNoteIds: ["note-1"],
    });
    await expect(restoreNote("user-1", "note-1")).resolves.toEqual({
      parentId: "folder-1",
      previousParentId: "folder-1",
      affectedFolderIds: [],
      affectedNoteIds: ["note-1"],
    });

    const deleteQuery = queryText(mocks.sql.mock.calls[1]);
    expect(deleteQuery).toContain("SET deleted_at = NOW()");
    expect(deleteQuery).not.toMatch(/DELETE FROM|app\.chunks|pdf_annotations/);

    const restoreQuery = queryText(mocks.sql.mock.calls[6]);
    expect(restoreQuery).toContain("cohort AS MATERIALIZED");
    expect(restoreQuery).toContain("note.deleted_at = cohort.deleted_at");
    expect(restoreQuery).toContain("WITH RECURSIVE subtree");
    expect(mocks.sql.mock.calls[6].slice(1)).not.toContain(
      "2026-08-12T10:00:00.000Z",
    );
    expect(queryText(mocks.sql.mock.calls[7])).toContain(
      "ON CONFLICT (user_id, note_id) DO UPDATE",
    );
  });

  it("restores at root when the saved parent is unavailable", async () => {
    mocks.sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          note_id: "note-1",
          parent_id: "deleted-folder",
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ note_id: "note-1", is_folder: false }])
      .mockResolvedValueOnce([]);

    await expect(restoreNote("user-1", "note-1")).resolves.toEqual({
      parentId: null,
      previousParentId: "deleted-folder",
      affectedFolderIds: [],
      affectedNoteIds: ["note-1"],
    });
  });

  it("deletes and restores the active folder subtree as one cohort", async () => {
    mocks.sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { note_id: "folder-1", is_folder: true },
        { note_id: "child-1", is_folder: false },
        { note_id: "nested-folder", is_folder: true },
      ])
      .mockResolvedValueOnce([{ parent_id: "course-1" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          note_id: "folder-1",
          parent_id: "course-1",
        },
      ])
      .mockResolvedValueOnce([{ note_id: "course-1" }])
      .mockResolvedValueOnce([
        { note_id: "folder-1", is_folder: true },
        { note_id: "child-1", is_folder: false },
        { note_id: "nested-folder", is_folder: true },
      ])
      .mockResolvedValueOnce([]);

    await expect(softDeleteNote("user-1", "folder-1")).resolves.toEqual({
      parentId: "course-1",
      previousParentId: "course-1",
      affectedFolderIds: ["folder-1", "nested-folder"],
      affectedNoteIds: ["folder-1", "child-1", "nested-folder"],
    });
    await expect(restoreNote("user-1", "folder-1")).resolves.toEqual({
      parentId: "course-1",
      previousParentId: "course-1",
      affectedFolderIds: ["folder-1", "nested-folder"],
      affectedNoteIds: ["folder-1", "child-1", "nested-folder"],
    });
  });

  it("returns null when the requested lifecycle transition is invalid", async () => {
    mocks.sql.mockResolvedValue([]);

    await expect(softDeleteNote("user-1", "note-1")).resolves.toBeNull();
    await expect(restoreNote("user-1", "note-1")).resolves.toBeNull();
  });
});
