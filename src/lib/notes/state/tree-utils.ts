// pure tree-manipulation utilities extracted from the Zustand store
// these are stateless functions that take data in and return data out

import { ROOT_ID, TreeItemModel, TreeModel } from "@/lib/notes/types/tree";
import { NoteModel } from "@/lib/notes/types/note";
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

/**
 * walk up the tree from a note to root, collecting each parent TreeItemModel
 */
export function findParentTreeItems(
  tree: TreeModel,
  note: NoteModel,
): TreeItemModel[] {
  const parents: TreeItemModel[] = [];

  let current = note;
  while (current.pid && current.pid !== ROOT_ID) {
    const parentItem = tree.items[current.pid];
    if (!parentItem?.data) break;

    parents.push(parentItem);
    current = parentItem.data;
  }

  return parents;
}

/**
 * check whether all ancestors of a note are expanded (i.e. the note is visible)
 */
export function checkAncestorsExpanded(
  tree: TreeModel,
  note: NoteModel,
): boolean {
  const parents = findParentTreeItems(tree, note);
  return parents.every((item) => !!item.isExpanded);
}

/**
 * API item shape returned by treeAPI.fetch / treeAPI.fetchChildren
 */
export interface ApiTreeItem {
  id: string;
  title?: string;
  isFolder?: boolean;
  isExpanded?: boolean;
  s3Key?: string;
  pinned?: NOTE_PINNED;
}

/**
 * convert an API response item into a TreeItemModel suitable for the store
 */
export function buildTreeItemFromApi(item: ApiTreeItem): TreeItemModel {
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
      deleted: NOTE_DELETED.NORMAL,
      shared: NOTE_SHARED.PRIVATE,
      pinned: item.pinned ?? NOTE_PINNED.UNPINNED,
    },
  };
}
