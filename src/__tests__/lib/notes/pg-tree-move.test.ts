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

vi.mock("@/database/pgsql.js", () => ({ default: mocks.sql }));
vi.mock("@/lib/cache", () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheKeys: { treeFull: vi.fn() },
}));

import { moveNoteInTree, TreeCycleError } from "@/lib/notes/storage/pg-tree.js";

function queryText(call: unknown[]): string {
  return (call[0] as TemplateStringsArray).join(" ");
}

describe("moveNoteInTree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sql.begin.mockImplementation(
      async (callback: (transaction: typeof mocks.tx) => unknown) =>
        callback(mocks.tx),
    );
  });

  it("locks, checks, and updates the tree in one transaction", async () => {
    mocks.tx
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { note_id: "folder", parent_id: null },
        { note_id: "child", parent_id: "folder" },
      ])
      .mockResolvedValueOnce([]);

    await moveNoteInTree("user-1", "child", null);

    expect(mocks.sql.begin).toHaveBeenCalledOnce();
    expect(mocks.tx).toHaveBeenCalledTimes(3);
    expect(queryText(mocks.tx.mock.calls[0])).toContain(
      "pg_advisory_xact_lock",
    );
    expect(queryText(mocks.tx.mock.calls[1])).toContain("FOR UPDATE");
    expect(queryText(mocks.tx.mock.calls[2])).toContain(
      "UPDATE app.tree_items",
    );
  });

  it("rejects moving a folder beneath its descendant before updating", async () => {
    mocks.tx.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { note_id: "folder", parent_id: null },
      { note_id: "child", parent_id: "folder" },
    ]);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(
      moveNoteInTree("user-1", "folder", "child"),
    ).rejects.toBeInstanceOf(TreeCycleError);

    expect(mocks.tx).toHaveBeenCalledTimes(2);
    expect(
      mocks.tx.mock.calls.some((call) =>
        queryText(call).includes("UPDATE app.tree_items"),
      ),
    ).toBe(false);
    consoleError.mockRestore();
  });
});
