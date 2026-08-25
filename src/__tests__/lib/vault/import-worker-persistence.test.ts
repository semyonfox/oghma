import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreProvider } from "@/lib/storage/base";

const mocks = vi.hoisted(() => {
  const tx = vi.fn();
  const sql = Object.assign(vi.fn(), {
    begin: vi.fn(async (callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    ),
  });
  return { sql, tx, invalidateTreeAfterPublish: vi.fn() };
});

vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));
vi.mock("@/lib/notes/tree-cache", () => ({
  invalidateTreeAfterPublish: mocks.invalidateTreeAfterPublish,
}));

import { persistVaultSourceFile } from "@/lib/vault/import-worker";

function queryText(call: unknown[]): string {
  return (call[0] as TemplateStringsArray).join(" ");
}

function createStorageMock() {
  return {
    putObject: vi
      .fn<StoreProvider["putObject"]>()
      .mockResolvedValue(undefined),
    deleteObject: vi
      .fn<StoreProvider["deleteObject"]>()
      .mockResolvedValue(undefined),
  };
}

function input(storage: ReturnType<typeof createStorageMock>) {
  return {
    storage,
    userId: "user-1",
    title: "lecture.pdf",
    parentId: null,
    s3Key: "vault/user-1/job-1/lecture.pdf",
    content: "",
    mimeType: "application/pdf",
    buffer: Buffer.from("pdf"),
  };
}

describe("persistVaultSourceFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.mockReset();
  });

  it("commits note, tree item, and attachment through one transaction", async () => {
    const storage = createStorageMock();
    mocks.tx
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          note_id: "note-1",
          user_id: "user-1",
          title: "lecture.pdf",
          content: "",
          is_folder: false,
          s3_key: "vault/user-1/job-1/lecture.pdf",
          created_at: new Date(),
          updated_at: new Date(),
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(persistVaultSourceFile(input(storage))).resolves.toEqual(
      expect.any(String),
    );

    expect(storage.putObject).toHaveBeenCalledOnce();
    expect(mocks.sql.begin).toHaveBeenCalledOnce();
    expect(queryText(mocks.tx.mock.calls[0])).toContain(
      "pg_advisory_xact_lock",
    );
    expect(queryText(mocks.tx.mock.calls[1])).toContain("INSERT INTO app.notes");
    expect(queryText(mocks.tx.mock.calls[2])).toContain(
      "INSERT INTO app.tree_items",
    );
    expect(queryText(mocks.tx.mock.calls[3])).toContain(
      "INSERT INTO app.attachments",
    );
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(mocks.invalidateTreeAfterPublish).toHaveBeenCalledWith(
      "user-1",
      null,
    );
  });

  it("removes the uploaded object when the relational transaction fails", async () => {
    const relationalError = new Error("attachment insert failed");
    const storage = createStorageMock();
    mocks.tx
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          note_id: "note-1",
          user_id: "user-1",
          title: "lecture.pdf",
          content: "",
          is_folder: false,
          s3_key: "vault/user-1/job-1/lecture.pdf",
          created_at: new Date(),
          updated_at: new Date(),
        },
      ])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(relationalError);

    await expect(persistVaultSourceFile(input(storage))).rejects.toBe(
      relationalError,
    );
    expect(storage.deleteObject).toHaveBeenCalledWith(
      "vault/user-1/job-1/lecture.pdf",
    );
    expect(mocks.invalidateTreeAfterPublish).not.toHaveBeenCalled();
  });
});
