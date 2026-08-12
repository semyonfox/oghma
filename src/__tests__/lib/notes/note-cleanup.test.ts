import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const sql = Object.assign(vi.fn(), { begin: vi.fn() });
  return {
    sql,
    tx: vi.fn(),
    deleteChunkVectors: vi.fn(),
    deleteObject: vi.fn(),
    getStorageProvider: vi.fn(),
    isSharedImportedFileKey: vi.fn(),
    warn: vi.fn(),
  };
});

vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));
vi.mock("@/lib/qdrant", () => ({
  deleteChunkVectors: mocks.deleteChunkVectors,
}));
vi.mock("@/lib/storage/init", () => ({
  getStorageProvider: mocks.getStorageProvider,
}));
vi.mock("@/lib/canvas/import-cache", () => ({
  isSharedImportedFileKey: mocks.isSharedImportedFileKey,
}));
vi.mock("@/lib/logger", () => ({
  default: { warn: mocks.warn },
}));

import { permanentlyDeleteTrashedNote } from "@/lib/notes/storage/note-cleanup";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const FOLDER_ID = "22222222-2222-2222-2222-222222222222";
const CHILD_ID = "33333333-3333-3333-3333-333333333333";
function queryText(call: unknown[]): string {
  return (call[0] as TemplateStringsArray).join(" ").replace(/\s+/g, " ");
}

function callsContaining(fragment: string): unknown[][] {
  return mocks.tx.mock.calls.filter((call) =>
    queryText(call).includes(fragment),
  );
}

function invocationOrder(call: unknown[]): number {
  const index = mocks.tx.mock.calls.indexOf(call);
  return mocks.tx.mock.invocationCallOrder[index];
}

describe("permanentlyDeleteTrashedNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStorageProvider.mockReturnValue({
      deleteObject: mocks.deleteObject,
    });
    mocks.deleteChunkVectors.mockResolvedValue(undefined);
    mocks.deleteObject.mockResolvedValue(undefined);
    mocks.isSharedImportedFileKey.mockImplementation((key: string) =>
      key.startsWith("imports/cache/"),
    );
    mocks.sql.begin.mockImplementation(
      (callback: (tx: typeof mocks.tx) => unknown) => callback(mocks.tx),
    );
    mocks.tx.mockImplementation((strings: TemplateStringsArray) => {
      const query = strings.join(" ").replace(/\s+/g, " ");
      if (query.includes("SELECT tree.parent_id")) {
        return [{ parent_id: "parent-folder" }];
      }
      if (
        query.includes("WITH RECURSIVE subtree") &&
        query.includes("SELECT note.note_id, note.is_folder")
      ) {
        return [
          { note_id: FOLDER_ID, is_folder: true },
          { note_id: CHILD_ID, is_folder: false },
        ];
      }
      if (query.includes("SELECT note.s3_key")) {
        return [
          { s3_key: "private/folder.pdf" },
          { s3_key: "private/folder.pdf" },
          { s3_key: "imports/cache/shared.pdf" },
          { s3_key: "marker/results/result.json" },
        ];
      }
      if (query.includes("SELECT id") && query.includes("FROM app.chunks")) {
        return [{ id: "chunk-1" }, { id: "chunk-2" }];
      }
      if (query.includes("DELETE FROM app.notes")) {
        return [
          { note_id: FOLDER_ID, is_folder: true },
          { note_id: CHILD_ID, is_folder: false },
        ];
      }
      return [];
    });
  });

  it("deletes only the selected folder's soft-delete cohort in one transaction", async () => {
    const deletion = await permanentlyDeleteTrashedNote(USER_ID, FOLDER_ID);

    expect(deletion).toEqual({
      noteIds: [FOLDER_ID, CHILD_ID],
      folderIds: [FOLDER_ID],
      parentId: "parent-folder",
    });
    expect(mocks.sql.begin).toHaveBeenCalledOnce();

    const cohortQuery = callsContaining("WITH RECURSIVE subtree")[0];
    expect(queryText(cohortQuery)).toContain(
      "JOIN cohort ON note.deleted_at = cohort.deleted_at",
    );
    expect(cohortQuery.slice(1).some((value) => value instanceof Date)).toBe(
      false,
    );

    const reparentCall = callsContaining("UPDATE app.tree_items retained")[0];
    const treeDeleteCall = callsContaining("DELETE FROM app.tree_items")[0];
    const noteDeleteCall = callsContaining("DELETE FROM app.notes")[0];
    expect(queryText(reparentCall)).toContain(
      "NOT (retained.note_id = ANY( ::uuid[]))",
    );
    expect(invocationOrder(reparentCall)).toBeLessThan(
      invocationOrder(treeDeleteCall),
    );
    expect(invocationOrder(treeDeleteCall)).toBeLessThan(
      invocationOrder(noteDeleteCall),
    );
  });

  it("cleans all cohort vectors and private objects after the commit", async () => {
    await permanentlyDeleteTrashedNote(USER_ID, FOLDER_ID);

    expect(mocks.deleteChunkVectors).toHaveBeenCalledWith([
      "chunk-1",
      "chunk-2",
    ]);
    expect(mocks.deleteObject).toHaveBeenCalledTimes(2);
    expect(mocks.deleteObject).toHaveBeenCalledWith("private/folder.pdf");
    expect(mocks.deleteObject).toHaveBeenCalledWith(
      "marker/results/result.json",
    );
    expect(mocks.deleteObject).not.toHaveBeenCalledWith(
      "imports/cache/shared.pdf",
    );
    expect(mocks.sql.begin.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteChunkVectors.mock.invocationCallOrder[0],
    );
  });

  it("does nothing when the selected note is not in trash", async () => {
    mocks.tx.mockResolvedValueOnce([]);

    await expect(
      permanentlyDeleteTrashedNote(USER_ID, FOLDER_ID),
    ).resolves.toBeNull();
    expect(mocks.tx).toHaveBeenCalledOnce();
    expect(mocks.deleteChunkVectors).not.toHaveBeenCalled();
    expect(mocks.getStorageProvider).not.toHaveBeenCalled();
  });
});
