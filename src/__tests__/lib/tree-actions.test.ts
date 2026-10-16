import { describe, expect, it } from "vitest";
import TreeActions, { DEFAULT_TREE } from "@/lib/notes/types/tree";
import { NOTE_DELETED, NOTE_PINNED, NOTE_SHARED } from "@/lib/notes/types/meta";

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
  const noteData = {
    id: "a",
    title: "First",
    deleted: NOTE_DELETED.NORMAL,
    shared: NOTE_SHARED.PRIVATE,
    pinned: NOTE_PINNED.UNPINNED,
    isFolder: false,
  };

  it("merges data onto an existing item", () => {
    let tree = treeWith(["a"]);
    tree = TreeActions.mutateItem(tree, "a", { isExpanded: true });
    expect(tree.items["a"].isExpanded).toBe(true);
    expect(tree.items["a"].children).toEqual([]);
  });

  it("deep merges data field", () => {
    let tree = treeWith(["a"]);
    tree = TreeActions.mutateItem(tree, "a", {
      data: noteData,
    });
    tree = TreeActions.mutateItem(tree, "a", {
      data: { ...noteData, title: "Updated" },
    });
    expect(tree.items["a"].data?.title).toBe("Updated");
  });

  it("does not mutate the caller's update object", () => {
    let tree = treeWith(["a"]);
    tree = TreeActions.mutateItem(tree, "a", {
      data: noteData,
    });
    const update = {
      data: { ...noteData, title: "Updated" },
    };

    TreeActions.mutateItem(tree, "a", update);

    expect(update).toEqual({
      data: { ...noteData, title: "Updated" },
    });
  });
});
