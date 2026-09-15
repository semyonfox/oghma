// pure tree-manipulation utilities extracted from the Zustand store
// these are stateless functions that take data in and return data out

import {
  ROOT_ID,
  TreeItemModel,
  TreeItemSummary,
  TreeModel,
} from "@/lib/notes/types/tree";
import { NOTE_DELETED, NOTE_SHARED, NOTE_PINNED } from "@/lib/notes/types/meta";

function hasPinnedDescendant(
  tree: TreeModel,
  id: string,
  visited = new Set<string>(),
): boolean {
  if (visited.has(id)) return false;
  visited.add(id);

  const item = tree.items[id];
  if (!item) return false;
  if (item.data?.pinned === NOTE_PINNED.PINNED) return true;

  return item.children.some((childId) =>
    hasPinnedDescendant(tree, childId, visited),
  );
}

/**
 * Build the Favorites tree from the currently loaded note tree.
 *
 * The normal tree is loaded lazily, so this function only includes loaded
 * pinned notes plus the ancestor chain needed to render them in context.
 * Children are filtered to included ids to avoid dangling react-complex-tree
 * references when a folder contains unpinned notes.
 */
export function buildPinnedTree(tree: TreeModel): TreeModel {
  const includedIds = new Set<string>([ROOT_ID]);

  for (const id of Object.keys(tree.items)) {
    if (id === ROOT_ID || hasPinnedDescendant(tree, id)) {
      includedIds.add(id);
    }
  }

  const items: TreeModel["items"] = {};
  for (const id of includedIds) {
    if (id === ROOT_ID) continue;

    const item = tree.items[id];
    if (!item) continue;

    items[id] = {
      ...item,
      children: item.children.filter((childId) => includedIds.has(childId)),
    };
  }

  return {
    rootId: ROOT_ID,
    items: {
      [ROOT_ID]: {
        ...tree.items[ROOT_ID],
        id: ROOT_ID,
        children: tree.items[ROOT_ID]?.children.filter((childId) =>
          includedIds.has(childId),
        ) ?? [],
      },
      ...items,
    },
  };
}

/** Convert the API's shallow tree item into the store's loaded-node shape. */
export function buildTreeItemFromApi(item: TreeItemSummary): TreeItemModel {
  return {
    id: item.id,
    children: [],
    isExpanded: item.isExpanded ?? false,
    isChildrenLoading: false,
    isFolder: item.isFolder ?? false,
    data: {
      id: item.id,
      title: item.title ?? "Untitled",
      isFolder: item.isFolder ?? false,
      s3Key: item.s3Key ?? undefined,
      mimeType: item.mimeType ?? undefined,
      deleted: NOTE_DELETED.NORMAL,
      shared: NOTE_SHARED.PRIVATE,
      pinned: item.pinned ?? NOTE_PINNED.UNPINNED,
    },
  };
}

const titleCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function sortTreeChildren(tree: TreeModel): TreeModel {
  const items = { ...tree.items };
  for (const [id, item] of Object.entries(items)) {
    items[id] = {
      ...item,
      children: [...item.children].sort((left, right) =>
        titleCollator.compare(items[left]?.data?.title ?? "", items[right]?.data?.title ?? "") ||
        left.localeCompare(right),
      ),
    };
  }
  return { ...tree, items };
}

/** Apply a shallow snapshot without pruning: another snapshot in this batch
 * may attach a moved subtree under its new parent. */
export function replaceTreeBranch(
  tree: TreeModel,
  parentId: string,
  children: TreeItemSummary[],
): TreeModel {
  const parent = tree.items[parentId];
  if (!parent) throw new Error("Tree parent is no longer loaded");
  const items = { ...tree.items };
  const childIds = new Set(children.map((child) => child.id));
  if (childIds.has(parentId) || childIds.has(ROOT_ID)) {
    throw new Error("Invalid tree child snapshot");
  }
  for (const [id, item] of Object.entries(items)) {
    if (id !== parentId && item.children.some((child) => childIds.has(child))) {
      items[id] = { ...item, children: item.children.filter((child) => !childIds.has(child)) };
    }
  }
  for (const summary of children) {
    const incoming = buildTreeItemFromApi(summary);
    const previous = items[summary.id];
    const keepChildren = previous && previous.isFolder === incoming.isFolder;
    items[summary.id] = {
      ...incoming,
      isExpanded: previous?.isExpanded ?? incoming.isExpanded,
      children: keepChildren ? previous.children : [],
      childrenLoaded: keepChildren ? previous.childrenLoaded : undefined,
      data: incoming.data ? {
        ...previous?.data,
        ...incoming.data,
        pid: parentId === ROOT_ID ? undefined : parentId,
      } : previous?.data,
    };
  }
  items[parentId] = { ...parent, children: [...childIds], childrenLoaded: true };
  return { ...tree, items };
}

/** Only reachable nodes belong to the sidebar. This never decides whether
 * an independently open note should be closed. */
export function pruneTree(tree: TreeModel): TreeModel {
  const items: TreeModel["items"] = {};
  const visited = new Set<string>([ROOT_ID]);
  const pending = [ROOT_ID];
  while (pending.length) {
    const id = pending.pop()!;
    const item = tree.items[id];
    if (!item) continue;
    const children = item.children.filter((childId) => {
      if (!tree.items[childId] || visited.has(childId)) return false;
      visited.add(childId);
      pending.push(childId);
      return true;
    });
    items[id] = { ...item, children };
  }
  return { ...tree, items };
}
