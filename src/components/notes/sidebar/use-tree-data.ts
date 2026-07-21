import { useMemo } from "react";
import useNoteTreeStore from "@/lib/notes/state/tree";
import { getCycleSafeChildren } from "@/lib/notes/state/tree-cycle";

// converts the flat note tree to react-complex-tree format
export function useTreeData() {
  const tree = useNoteTreeStore((s) => s.tree);

  return useMemo(() => {
    const result: Record<string, any> = {};
    const safeChildren = getCycleSafeChildren(tree);

    const root = tree.items["root"];
    if (root) {
      result["root"] = {
        index: "root",
        canMove: false,
        canRename: false,
        children: safeChildren.root ?? [],
        isFolder: true,
        data: { title: "Root", isFolder: true },
      };
    }

    for (const id in tree.items) {
      if (id === "root") continue;
      const item = tree.items[id];
      if (!item) continue;

      const isFolder =
        item.data?.isFolder === true ||
        item.isFolder === true ||
        (item.children && item.children.length > 0);

      result[id] = {
        index: id,
        canMove: true,
        canRename: false,
        children: safeChildren[id] ?? [],
        data: item.data,
        isFolder,
        canDropOn: isFolder,
      };
    }

    return result;
  }, [tree]);
}
