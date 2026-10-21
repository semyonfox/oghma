// extracted from Notea (MIT License)
// adapted for oghma - removed @atlaskit/tree and lodash dependencies

import { DocumentBundle, NoteModel } from "./note";

export interface TreeItem {
  id: string;
  children: string[];
  hasChildren?: boolean;
  isExpanded?: boolean;
  isChildrenLoading?: boolean;
  isFolder?: boolean; // Whether this item is a folder (can contain children)
  childrenLoaded?: boolean; // Whether children have been loaded from server (even if empty)
}

export interface TreeData {
  rootId: string;
  items: Record<string, TreeItem>;
}

export interface TreeItemModel extends TreeItem {
  id: string;
  data?: NoteModel;
  children: string[];
}

/** The shallow, immutable shape returned by the tree-children endpoint. */
export interface TreeItemSummary {
  id: string;
  title?: string;
  isFolder?: boolean;
  isExpanded?: boolean;
  s3Key?: string | null;
  mimeType?: string | null;
  pinned?: number;
  bundle?: DocumentBundle;
}

export interface TreeModel extends TreeData {
  rootId: string;
  items: Record<string, TreeItemModel>;
}

export const ROOT_ID = "root";

export function createEmptyTree(): TreeModel {
  return {
    rootId: ROOT_ID,
    items: {
      root: { id: ROOT_ID, children: [] },
    },
  };
}

export const DEFAULT_TREE = createEmptyTree();

export interface TreeMoveRequest {
  noteId: string;
  expectedParentId: string | null;
  parentId: string | null;
}

export interface TreeMoveResult {
  success: true;
  noteId: string;
  oldParentId: string | null;
  newParentId: string | null;
}

interface TreeExpansionRequest {
  id: string;
  isExpanded: boolean;
}

export type TreeMutationRequest =
  | { action: "move"; data: TreeMoveRequest }
  | { action: "mutate"; data: TreeExpansionRequest };

/** Fields the client may update locally without widening the server contract. */
export type TreeItemUpdate = Pick<
  Partial<TreeItemModel>,
  "data" | "isExpanded" | "isFolder"
>;

function addItem(tree: TreeModel, id: string, pid = ROOT_ID) {
  const newItems = { ...tree.items };

  newItems[id] = newItems[id] || {
    id,
    children: [],
  };

  const parentItem = newItems[pid];

  if (parentItem) {
    newItems[pid] = {
      ...parentItem,
      children: parentItem.children.includes(id)
        ? parentItem.children
        : [...parentItem.children, id],
    };
  } else {
    throw new Error(`Parent ID '${pid}' does not refer to a valid item`);
  }

  return { ...tree, items: newItems };
}

function mutateItem(tree: TreeModel, id: string, data: Partial<TreeItemModel>) {
  const existingItem = tree.items[id];
  const mergedData =
    data.data && existingItem?.data
      ? { ...existingItem.data, ...data.data }
      : data.data;

  const newItems = { ...tree.items };
  newItems[id] = {
    ...existingItem,
    ...data,
    ...(mergedData && { data: mergedData }),
    id,
    children: data.children ?? existingItem?.children ?? [],
  } as TreeItemModel;

  return { ...tree, items: newItems };
}

function removeItem(tree: TreeModel, id: string) {
  const newTree = { ...tree, items: { ...tree.items } };

  for (const itemKey in newTree.items) {
    const item = newTree.items[itemKey];
    if (item.children.includes(id)) {
      newTree.items[itemKey] = {
        ...item,
        children: item.children.filter((childId) => childId !== id),
      };
    }
  }

  return newTree;
}

function deleteItem(tree: TreeModel, id: string) {
  const newTree = { ...tree, items: { ...tree.items } };
  delete newTree.items[id];

  return newTree;
}

const TreeActions = {
  addItem,
  mutateItem,
  removeItem,
  deleteItem,
};

export default TreeActions;
