import { ROOT_ID, TreeModel } from "@/lib/notes/types/tree";

export function getVisibleTreeItemIds(
  tree: TreeModel,
  expandedIds: Set<string>,
  rootId = ROOT_ID,
): string[] {
  const root = tree.items[rootId];
  if (!root) return [];

  const result: string[] = [];

  const visit = (id: string) => {
    if (id === ROOT_ID || !tree.items[id]) return;

    result.push(id);

    if (!expandedIds.has(id)) return;
    for (const childId of tree.items[id].children) {
      visit(childId);
    }
  };

  for (const childId of root.children) {
    visit(childId);
  }

  return result;
}

export function getVisibleRangeSelection(
  visibleIds: string[],
  anchorId: string | null,
  clickedId: string,
): string[] {
  if (!anchorId) return [clickedId];

  const anchorIndex = visibleIds.indexOf(anchorId);
  const clickedIndex = visibleIds.indexOf(clickedId);

  if (anchorIndex === -1 || clickedIndex === -1) return [clickedId];

  const start = Math.min(anchorIndex, clickedIndex);
  const end = Math.max(anchorIndex, clickedIndex);
  return visibleIds.slice(start, end + 1);
}

export function toggleSelectedId(
  selectedIds: Set<string>,
  clickedId: string,
): Set<string> {
  const next = new Set(selectedIds);
  if (next.has(clickedId)) {
    next.delete(clickedId);
  } else {
    next.add(clickedId);
  }
  return next;
}

export function getTopLevelSelectedIds(
  selectedIds: Iterable<string>,
  tree: TreeModel,
): string[] {
  const selected = new Set(
    Array.from(selectedIds).filter((id) => id !== ROOT_ID && tree.items[id]),
  );
  const parentById = new Map<string, string>();

  for (const parentId in tree.items) {
    for (const childId of tree.items[parentId].children) {
      parentById.set(childId, parentId);
    }
  }

  return Array.from(selected).filter((id) => {
    let parentId = parentById.get(id);
    while (parentId) {
      if (selected.has(parentId)) return false;
      if (parentId === ROOT_ID) return true;
      parentId = parentById.get(parentId);
    }
    return true;
  });
}

export function treeItemContainsId(
  tree: TreeModel,
  ancestorId: string,
  descendantId: string,
): boolean {
  const ancestor = tree.items[ancestorId];
  if (!ancestor) return false;

  for (const childId of ancestor.children) {
    if (childId === descendantId) return true;
    if (treeItemContainsId(tree, childId, descendantId)) return true;
  }

  return false;
}
