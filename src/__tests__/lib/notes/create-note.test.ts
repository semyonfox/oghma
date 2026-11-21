import { describe, expect, it, vi } from "vitest";

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

describe("createNoteWithTree", () => {
  // the PostgreSQL suite covers this too, but it only gates main and an orphan
  // note on dev is invisible in the sidebar
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

    const writes = mocks.tx.mock.calls.filter(([parts]) =>
      Array.from(parts).join(" ").includes("INSERT"),
    );
    expect(writes).toEqual([]);
  });
});
