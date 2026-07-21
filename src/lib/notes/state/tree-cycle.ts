import { ROOT_ID, TreeModel } from "@/lib/notes/types/tree";

export function treeItemContainsId(
  tree: TreeModel,
  ancestorId: string,
  descendantId: string,
): boolean {
  const pending = [...(tree.items[ancestorId]?.children ?? [])];
  const visited = new Set<string>([ancestorId]);

  while (pending.length > 0) {
    const childId = pending.pop();
    if (!childId || visited.has(childId)) continue;
    if (childId === descendantId) return true;

    visited.add(childId);
    pending.push(...(tree.items[childId]?.children ?? []));
  }

  return false;
}

export function wouldCreateTreeCycle(
  tree: TreeModel,
  itemId: string,
  parentId: string,
): boolean {
  return itemId === parentId || treeItemContainsId(tree, itemId, parentId);
}

export function getCycleSafeChildren(tree: TreeModel): Record<string, string[]> {
  const safeChildren: Record<string, string[]> = {};
  const visited = new Set<string>();

  const visit = (id: string) => {
    visited.add(id);
    safeChildren[id] = [];

    for (const childId of new Set(tree.items[id]?.children ?? [])) {
      if (
        childId === ROOT_ID ||
        !tree.items[childId] ||
        visited.has(childId)
      ) {
        continue;
      }

      safeChildren[id].push(childId);
      visit(childId);
    }
  };

  if (tree.items[ROOT_ID]) visit(ROOT_ID);
  for (const id of Object.keys(tree.items)) {
    if (!visited.has(id)) visit(id);
  }

  return safeChildren;
}
