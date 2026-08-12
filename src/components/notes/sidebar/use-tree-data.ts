import { useMemo } from "react";
import useNoteTreeStore from "@/lib/notes/state/tree";
import { getCycleSafeChildren } from "@/lib/notes/state/tree-cycle";
import type { NoteModel } from "@/lib/notes/types/note";
import type {
  TreeItem as ComplexTreeItem,
  TreeItemIndex,
} from "react-complex-tree";

export type SidebarTreeItem = ComplexTreeItem<NoteModel | undefined>;

// converts the flat note tree to react-complex-tree format
export function useTreeData() {
  const tree = useNoteTreeStore((s) => s.tree);

  return useMemo(() => {
    const result: Record<TreeItemIndex, SidebarTreeItem> = {};
    const safeChildren = getCycleSafeChildren(tree);

    const root = tree.items["root"];
    if (root) {
      result["root"] = {
        index: "root",
        canMove: false,
        canRename: false,
        children: safeChildren.root ?? [],
        isFolder: true,
        data: undefined,
      };
    }

    for (const id in tree.items) {
      if (id === "root") continue;
      const item = tree.items[id];
      if (!item) continue;

      const isFolder =
        item.data?.isFolder === true ||
        item.isFolder === true ||
        item.children.length > 0;

      result[id] = {
        index: id,
        canMove: true,
        canRename: false,
        children: safeChildren[id] ?? [],
        data: item.data,
        isFolder,
      };
    }

    return result;
  }, [tree]);
}
