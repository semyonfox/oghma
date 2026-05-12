import { describe, expect, it } from "vitest";
import TreeActions, { DEFAULT_TREE, ROOT_ID } from "@/lib/notes/types/tree";
import {
  getTopLevelSelectedIds,
  getVisibleRangeSelection,
  getVisibleTreeItemIds,
  treeItemContainsId,
  toggleSelectedId,
} from "@/components/notes/sidebar/selection-utils";

describe("sidebar selection utilities", () => {
  it("excludes selected descendants when an ancestor is selected", () => {
    let tree = TreeActions.addItem(DEFAULT_TREE, "folder");
    tree = TreeActions.addItem(tree, "child", "folder");
    tree = TreeActions.addItem(tree, "grandchild", "child");
    tree = TreeActions.addItem(tree, "sibling");

    expect(
      getTopLevelSelectedIds(
        ["folder", "child", "grandchild", "sibling"],
        tree,
      ),
    ).toEqual(["folder", "sibling"]);
  });

  it("returns a shift-click range from the visible tree order", () => {
    let tree = TreeActions.addItem(DEFAULT_TREE, "a");
    tree = TreeActions.addItem(tree, "folder");
    tree = TreeActions.addItem(tree, "b", "folder");
    tree = TreeActions.addItem(tree, "c", "folder");
    tree = TreeActions.addItem(tree, "d");

    const visibleIds = getVisibleTreeItemIds(tree, new Set(["folder"]));

    expect(visibleIds).toEqual(["a", "folder", "b", "c", "d"]);
    expect(getVisibleRangeSelection(visibleIds, "folder", "c")).toEqual([
      "folder",
      "b",
      "c",
    ]);
  });

  it("does not include collapsed descendants in visible order", () => {
    let tree = TreeActions.addItem(DEFAULT_TREE, "folder");
    tree = TreeActions.addItem(tree, "child", "folder");
    tree = TreeActions.addItem(tree, "after");

    expect(getVisibleTreeItemIds(tree, new Set())).toEqual(["folder", "after"]);
  });

  it("toggles one selected id without changing the others", () => {
    expect(Array.from(toggleSelectedId(new Set(["a", "b"]), "b"))).toEqual([
      "a",
    ]);
    expect(Array.from(toggleSelectedId(new Set(["a"]), "b"))).toEqual([
      "a",
      "b",
    ]);
  });

  it("never returns root as a top-level delete candidate", () => {
    const tree = TreeActions.addItem(DEFAULT_TREE, "a");
    expect(getTopLevelSelectedIds([ROOT_ID, "a"], tree)).toEqual(["a"]);
  });

  it("detects whether one loaded tree item contains another", () => {
    let tree = TreeActions.addItem(DEFAULT_TREE, "folder");
    tree = TreeActions.addItem(tree, "child", "folder");
    tree = TreeActions.addItem(tree, "after");

    expect(treeItemContainsId(tree, "folder", "child")).toBe(true);
    expect(treeItemContainsId(tree, "folder", "after")).toBe(false);
  });
});
