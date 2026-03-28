// extracted from Notea (MIT License)
// adapted for oghma - removed @atlaskit/tree and lodash dependencies

import { NoteModel } from "./note";

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

export interface TreeModel extends TreeData {
  rootId: string;
  items: Record<string, TreeItemModel>;
}

export const ROOT_ID = "root";

export const DEFAULT_TREE: TreeModel = {
  rootId: ROOT_ID,
  items: {
    root: {
      id: ROOT_ID,
      children: [],
    },
  },
};

export interface MovePosition {
  parentId: string;
  index: number;
}

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

  if (data.data && existingItem?.data) {
    data.data = {
      ...existingItem.data,
      ...data.data,
    };
  }

  const newItems = { ...tree.items };
  newItems[id] = {
    ...existingItem,
    ...data,
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

function moveItem(
  tree: TreeModel,
  source: MovePosition,
  destination?: MovePosition,
) {
  if (!destination) {
    return tree;
  }

  const newTree = { ...tree, items: { ...tree.items } };
  const sourceParent = newTree.items[source.parentId];
  const destParent = newTree.items[destination.parentId];

  if (!sourceParent || !destParent) {
    return tree;
  }

  const itemId = sourceParent.children[source.index];
  if (!itemId) {
    return tree;
  }

  // remove from source using ID (not index) to avoid stale-index bugs
  const filteredSourceChildren = sourceParent.children.filter(
    (id) => id !== itemId,
  );
  newTree.items[source.parentId] = {
    ...sourceParent,
    children: filteredSourceChildren,
  };

  // for same-parent moves, read from the already-updated parent
  const updatedDestParent = newTree.items[destination.parentId];
  const baseChildren = [...updatedDestParent.children];

  // adjust destination index for same-parent reorder since we already removed the item
  let destIdx = destination.index;
  if (
    source.parentId === destination.parentId &&
    source.index < destination.index
  ) {
    destIdx = Math.max(0, destIdx - 1);
  }

  baseChildren.splice(destIdx, 0, itemId);
  newTree.items[destination.parentId] = {
    ...updatedDestParent,
    children: baseChildren,
  };

  return newTree;
}

/**
 * remove from original parent node, add to new parent node
 */
function restoreItem(tree: TreeModel, id: string, pid = ROOT_ID) {
  tree = removeItem(tree, id);
  tree = addItem(tree, id, pid);

  return tree;
}

function deleteItem(tree: TreeModel, id: string) {
  const newTree = { ...tree, items: { ...tree.items } };
  delete newTree.items[id];

  return newTree;
}

const flattenTree = (
  tree: TreeModel,
  rootId = tree.rootId,
): TreeItemModel[] => {
  if (!tree.items[rootId]) {
    return [];
  }

  const result: TreeItemModel[] = [];

  for (const itemId of tree.items[rootId].children) {
    const item = tree.items[itemId];
    if (item) {
      result.push(item);
      const children = flattenTree({
        rootId: item.id,
        items: tree.items,
      });
      result.push(...children);
    }
  }

  return result;
};

export type HierarchicalTreeItemModel = Omit<TreeItemModel, "children"> & {
  children: HierarchicalTreeItemModel[];
};

export function makeHierarchy(
  tree: TreeModel,
  rootId = tree.rootId,
): HierarchicalTreeItemModel | false {
  if (!tree.items[rootId]) {
    return false;
  }

  const root = tree.items[rootId];

  return {
    ...root,
    children: root.children
      .map((v) => makeHierarchy(tree, v))
      .filter((v) => !!v) as HierarchicalTreeItemModel[],
  };
}

export function cleanItemModel(model: Partial<TreeItemModel>): TreeItemModel {
  if (!model.id) throw new Error("Missing id on tree model");

  const children = model.children ?? [];

  return {
    ...model,
    id: model.id,
    children,
    hasChildren: children.length > 0,
    data: model.data,
    isExpanded: model.isExpanded ?? false,
  };
}

export function cleanTreeModel(model: Partial<TreeModel>): TreeModel {
  const items: TreeModel["items"] = {};
  if (model.items) {
    for (const itemId in model.items) {
      const item = model.items[itemId];
      if (!item) {
        continue;
      }

      const cleanedItem = cleanItemModel(item);
      const children: string[] = [];
      for (const child of cleanedItem.children) {
        if (child && model.items[child]) {
          children.push(child);
        }
      }

      items[itemId] = {
        ...cleanedItem,
        children,
      };
    }
  }

  return {
    ...model,
    rootId: model.rootId ?? ROOT_ID,
    items: items,
  };
}

const TreeActions = {
  addItem,
  mutateItem,
  removeItem,
  moveItem,
  restoreItem,
  deleteItem,
  flattenTree,
  makeHierarchy,
  cleanTreeModel,
  cleanItemModel,
};

export default TreeActions;
