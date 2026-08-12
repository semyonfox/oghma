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
vi.mock("@/lib/cache", () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheKeys: { treeFull: vi.fn() },
}));

import {
  moveNoteInTree,
  TreeCycleError,
  TreeParentError,
} from "@/lib/notes/storage/pg-tree";

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

  it("moves an active note at root while serializing the user tree", async () => {
    mocks.tx.mockImplementation((strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      if (query.includes("FROM app.notes") && query.includes("FOR UPDATE")) {
        return [{ note_id: "child" }];
      }
      if (query.includes("SELECT note_id, parent_id")) {
        return [
          { note_id: "folder", parent_id: null },
          { note_id: "child", parent_id: "folder" },
        ];
      }
      if (query.includes("UPDATE app.tree_items")) {
        return [{ note_id: "child" }];
      }
      return [];
    });

    await expect(moveNoteInTree("user-1", "child", null)).resolves.toBeUndefined();

    const queries = mocks.tx.mock.calls.map(queryText);
    expect(queries.some((query) => query.includes("pg_advisory_xact_lock"))).toBe(
      true,
    );
    expect(queries.some((query) => query.includes("deleted_at IS NULL"))).toBe(
      true,
    );
    expect(queries.some((query) => query.includes("UPDATE app.tree_items"))).toBe(
      true,
    );
  });

  it("rejects a non-folder or unavailable destination before changing the tree", async () => {
    mocks.tx.mockImplementation((strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      if (query.includes("FROM app.notes") && query.includes("FOR UPDATE")) {
        return [{ note_id: "child" }];
      }
      if (query.includes("is_folder = TRUE")) return [];
      return [];
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      moveNoteInTree("user-1", "child", "not-a-folder"),
    ).rejects.toBeInstanceOf(TreeParentError);

    expect(
      mocks.tx.mock.calls.some((call) =>
        queryText(call).includes("UPDATE app.tree_items"),
      ),
    ).toBe(false);
    consoleError.mockRestore();
  });

  it("rejects a cycle before changing the tree", async () => {
    mocks.tx.mockImplementation((strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      if (query.includes("FROM app.notes") && query.includes("FOR UPDATE")) {
        return [{ note_id: "folder" }];
      }
      if (query.includes("is_folder = TRUE")) return [{ note_id: "child" }];
      if (query.includes("SELECT note_id, parent_id")) {
        return [
          { note_id: "folder", parent_id: null },
          { note_id: "child", parent_id: "folder" },
        ];
      }
      return [];
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      moveNoteInTree("user-1", "folder", "child"),
    ).rejects.toBeInstanceOf(TreeCycleError);

    expect(
      mocks.tx.mock.calls.some((call) =>
        queryText(call).includes("UPDATE app.tree_items"),
      ),
    ).toBe(false);
    consoleError.mockRestore();
  });
});
