import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  treeFull: vi.fn(() => "tree-key"),
}));

vi.mock("@/database/pgsql.js", () => ({ default: mocks.sql }));
vi.mock("@/lib/cache", () => ({
  cacheGet: mocks.cacheGet,
  cacheSet: mocks.cacheSet,
  cacheKeys: { treeFull: mocks.treeFull },
}));

import { getTreeFromPG } from "@/lib/notes/storage/pg-tree.js";

describe("getTreeFromPG with a restored child", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cacheGet.mockResolvedValue(undefined);
  });

  it("renders an item at root while retaining an unavailable Trash parent in storage", async () => {
    mocks.sql.mockResolvedValueOnce([
      {
        note_id: "restored-child",
        parent_id: "still-trashed-parent",
        is_expanded: false,
        title: "Recovered note",
      },
    ]);

    const tree = await getTreeFromPG("user-1");

    expect(tree.items.root.children).toEqual(["restored-child"]);
    expect(tree.items["still-trashed-parent"]).toBeUndefined();
    expect(tree.items["restored-child"].children).toEqual([]);
  });
});
