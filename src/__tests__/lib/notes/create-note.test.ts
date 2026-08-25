import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = vi.fn();
  const sql = Object.assign(vi.fn(), {
    begin: vi.fn(async (callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    ),
  });
  return { sql, tx };
});

vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));

import {
  createNoteWithTree,
  InvalidNoteParentError,
} from "@/lib/notes/storage/create-note";

function queryText(call: unknown[]): string {
  return (call[0] as TemplateStringsArray).join(" ");
}

describe("createNoteWithTree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.mockReset();
  });

  it("validates the parent and inserts the note and sole tree row in one transaction", async () => {
    mocks.tx
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ note_id: "folder-1" }])
      .mockResolvedValueOnce([
        {
          note_id: "note-1",
          user_id: "user-1",
          title: "Notes",
          content: "Body",
          is_folder: false,
          s3_key: null,
          created_at: new Date("2026-08-12T12:00:00Z"),
          updated_at: new Date("2026-08-12T12:00:00Z"),
        },
      ])
      .mockResolvedValueOnce([]);

    await expect(
      createNoteWithTree({
        noteId: "note-1",
        userId: "user-1",
        title: "Notes",
        content: "Body",
        isFolder: false,
        parentId: "folder-1",
      }),
    ).resolves.toMatchObject({ noteId: "note-1", userId: "user-1" });

    expect(mocks.sql.begin).toHaveBeenCalledOnce();
    expect(queryText(mocks.tx.mock.calls[0])).toContain(
      "pg_advisory_xact_lock",
    );
    expect(queryText(mocks.tx.mock.calls[1])).toContain("FOR SHARE");
    expect(queryText(mocks.tx.mock.calls[2])).toContain("INSERT INTO app.notes");
    expect(queryText(mocks.tx.mock.calls[3])).toContain(
      "INSERT INTO app.tree_items",
    );
  });

  it("does not create an orphan when the requested parent is unavailable", async () => {
    mocks.tx.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await expect(
      createNoteWithTree({
        noteId: "note-1",
        userId: "user-1",
        title: "Notes",
        content: "",
        isFolder: false,
        parentId: "missing-folder",
      }),
    ).rejects.toBeInstanceOf(InvalidNoteParentError);

    expect(mocks.tx).toHaveBeenCalledTimes(2);
    expect(queryText(mocks.tx.mock.calls[1])).toContain("is_folder = true");
  });
});
