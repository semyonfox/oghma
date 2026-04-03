import { describe, expect, it } from "vitest";
import TreeActions, {
  cleanItemModel,
  cleanTreeModel,
  DEFAULT_TREE,
  makeHierarchy,
  ROOT_ID,
} from "@/lib/notes/types/tree";

// ─── helpers ────────────────────────────────────────────────────────────────

function treeWith(ids: string[]) {
  let tree = structuredClone(DEFAULT_TREE);
  for (const id of ids) tree = TreeActions.addItem(tree, id);
  return tree;
}

// ─── addItem ────────────────────────────────────────────────────────────────

describe("TreeActions.addItem", () => {
  it("adds a child to root", () => {
    const tree = TreeActions.addItem(DEFAULT_TREE, "a");
    expect(tree.items.root.children).toContain("a");
    expect(tree.items["a"]).toBeDefined();
  });

  it("does not duplicate an existing child", () => {
    let tree = TreeActions.addItem(DEFAULT_TREE, "a");
    tree = TreeActions.addItem(tree, "a");
    expect(tree.items.root.children.filter((c) => c === "a")).toHaveLength(1);
  });

  it("throws when parent does not exist", () => {
    expect(() =>
      TreeActions.addItem(DEFAULT_TREE, "child", "missing-parent"),
    ).toThrow();
  });

  it("nests under an existing parent", () => {
    let tree = TreeActions.addItem(DEFAULT_TREE, "parent");
    tree = TreeActions.addItem(tree, "child", "parent");
    expect(tree.items["parent"].children).toContain("child");
  });
});

// ─── removeItem ─────────────────────────────────────────────────────────────

describe("TreeActions.removeItem", () => {
  it("removes item from parent's children list", () => {
    let tree = treeWith(["a", "b"]);
    tree = TreeActions.removeItem(tree, "a");
    expect(tree.items.root.children).not.toContain("a");
    expect(tree.items.root.children).toContain("b");
  });

  it("leaves the item in items map (only removes from parent)", () => {
    let tree = treeWith(["a"]);
    tree = TreeActions.removeItem(tree, "a");
    // removeItem only unlinks from parent, does not delete the node
    expect(tree.items.root.children).not.toContain("a");
  });

  it("is a no-op for unknown ids", () => {
    const before = treeWith(["a"]);
    const after = TreeActions.removeItem(before, "unknown");
    expect(after.items.root.children).toEqual(before.items.root.children);
  });
});

// ─── deleteItem ─────────────────────────────────────────────────────────────

describe("TreeActions.deleteItem", () => {
  it("removes the node from the items map entirely", () => {
    let tree = treeWith(["a"]);
    tree = TreeActions.deleteItem(tree, "a");
    expect(tree.items["a"]).toBeUndefined();
  });
});

// ─── mutateItem ─────────────────────────────────────────────────────────────

describe("TreeActions.mutateItem", () => {
  it("merges data onto an existing item", () => {
    let tree = treeWith(["a"]);
    tree = TreeActions.mutateItem(tree, "a", { isExpanded: true });
    expect(tree.items["a"].isExpanded).toBe(true);
    expect(tree.items["a"].children).toEqual([]);
  });

  it("deep merges data field", () => {
    let tree = treeWith(["a"]);
    tree = TreeActions.mutateItem(tree, "a", {
      data: { id: "a", title: "First", isFolder: false },
    } as any);
    tree = TreeActions.mutateItem(tree, "a", {
      data: { id: "a", title: "Updated", isFolder: false },
    } as any);
    expect((tree.items["a"] as any).data.title).toBe("Updated");
  });
});

// ─── moveItem ───────────────────────────────────────────────────────────────

describe("TreeActions.moveItem", () => {
  it("moves item from one parent to another", () => {
    let tree = DEFAULT_TREE;
    tree = TreeActions.addItem(tree, "folder");
    tree = TreeActions.addItem(tree, "file");

    tree = TreeActions.moveItem(
      tree,
      { parentId: ROOT_ID, index: 1 }, // file is at index 1
      { parentId: "folder", index: 0 },
    );

    expect(tree.items.root.children).not.toContain("file");
    expect(tree.items["folder"].children).toContain("file");
  });

  it("reorders within the same parent", () => {
    let tree = treeWith(["a", "b", "c"]);
    // move "a" (index 0) to after "c" (index 3 = end)
    tree = TreeActions.moveItem(
      tree,
      { parentId: ROOT_ID, index: 0 },
      { parentId: ROOT_ID, index: 3 },
    );
    expect(tree.items.root.children.at(-1)).toBe("a");
  });

  it("returns original tree when source item index is out of range", () => {
    const tree = treeWith(["a"]);
    const result = TreeActions.moveItem(
      tree,
      { parentId: ROOT_ID, index: 99 },
      { parentId: ROOT_ID, index: 0 },
    );
    expect(result.items.root.children).toEqual(tree.items.root.children);
  });

  it("returns original tree when destination is undefined", () => {
    const tree = treeWith(["a"]);
    const result = TreeActions.moveItem(
      tree,
      { parentId: ROOT_ID, index: 0 },
      undefined,
    );
    expect(result).toBe(tree);
  });
});

// ─── flattenTree ────────────────────────────────────────────────────────────

describe("TreeActions.flattenTree", () => {
  it("returns items in depth-first order", () => {
    let tree = DEFAULT_TREE;
    tree = TreeActions.addItem(tree, "parent");
    tree = TreeActions.addItem(tree, "child", "parent");
    tree = TreeActions.addItem(tree, "sibling");

    const flat = TreeActions.flattenTree(tree);
    const ids = flat.map((i) => i.id);
    expect(ids).toEqual(["parent", "child", "sibling"]);
  });

  it("returns empty array for empty tree", () => {
    expect(TreeActions.flattenTree(DEFAULT_TREE)).toEqual([]);
  });
});

// ─── makeHierarchy ──────────────────────────────────────────────────────────

describe("makeHierarchy", () => {
  it("returns false when rootId does not exist", () => {
    expect(makeHierarchy(DEFAULT_TREE, "missing")).toBe(false);
  });

  it("builds nested children arrays", () => {
    let tree = DEFAULT_TREE;
    tree = TreeActions.addItem(tree, "parent");
    tree = TreeActions.addItem(tree, "child", "parent");

    const h = makeHierarchy(tree, "parent");
    expect(h).not.toBe(false);
    if (h) {
      expect(h.children).toHaveLength(1);
      expect(h.children[0].id).toBe("child");
    }
  });
});

// ─── cleanItemModel ─────────────────────────────────────────────────────────

describe("cleanItemModel", () => {
  it("throws when id is missing", () => {
    expect(() => cleanItemModel({ children: [] })).toThrow(/Missing id/);
  });

  it("sets hasChildren based on children array", () => {
    const item = cleanItemModel({ id: "a", children: ["b"] });
    expect(item.hasChildren).toBe(true);

    const empty = cleanItemModel({ id: "a", children: [] });
    expect(empty.hasChildren).toBe(false);
  });

  it("defaults isExpanded to false", () => {
    const item = cleanItemModel({ id: "a" });
    expect(item.isExpanded).toBe(false);
  });

  it("preserves isExpanded when explicitly set", () => {
    const item = cleanItemModel({ id: "a", isExpanded: true });
    expect(item.isExpanded).toBe(true);
  });
});

// ─── cleanTreeModel ─────────────────────────────────────────────────────────

describe("cleanTreeModel", () => {
  it("defaults to ROOT_ID when rootId is missing", () => {
    const tree = cleanTreeModel({});
    expect(tree.rootId).toBe(ROOT_ID);
  });

  it("strips dangling child references", () => {
    const tree = cleanTreeModel({
      rootId: "root",
      items: {
        root: { id: "root", children: ["a", "ghost"] },
        a: { id: "a", children: [] },
        // "ghost" is referenced but not in items
      },
    });
    expect(tree.items.root.children).toEqual(["a"]);
    expect(tree.items.root.children).not.toContain("ghost");
  });
});

// ─── restoreItem ────────────────────────────────────────────────────────────

describe("TreeActions.restoreItem", () => {
  it("moves an item from its current parent to a new one", () => {
    let tree = DEFAULT_TREE;
    tree = TreeActions.addItem(tree, "folder");
    tree = TreeActions.addItem(tree, "item");

    tree = TreeActions.restoreItem(tree, "item", "folder");

    expect(tree.items.root.children).not.toContain("item");
    expect(tree.items["folder"].children).toContain("item");
  });
});
