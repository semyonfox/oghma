// extracted from Notea (MIT License)
import { create } from "zustand";
import { genId } from "@/lib/notes/utils/id";
import TreeActions, {
  DEFAULT_TREE,
  ROOT_ID,
  TreeItemSummary,
  TreeItemUpdate,
  TreeMoveRequest,
  TreeMutationRequest,
  TreeModel,
} from "@/lib/notes/types/tree";
import noteCache from "../cache/note";
import { NOTE_DELETED } from "@/lib/notes/types/meta";
import { NoteModel } from "@/lib/notes/types/note";
import { uiCache } from "../cache";
import {
  buildTreeItemFromApi,
  buildPinnedTree,
} from "./tree-utils";

const TREE_CACHE_KEY = "tree";

type Toast = (message: string, type?: "error") => void;

interface TreeApi {
  fetch: () => Promise<{ items: TreeItemSummary[] } | undefined>;
  fetchChildren: (
    parentId: string | null,
  ) => Promise<{ items: TreeItemSummary[] } | undefined>;
  mutate: (body: TreeMutationRequest) => Promise<{ success: true } | undefined>;
}

function treeState(tree: TreeModel) {
  return { tree, pinnedTree: buildPinnedTree(tree) };
}

export interface NoteTreeState {
  tree: TreeModel;
  pinnedTree: TreeModel;
  initLoaded: boolean;
  loading: boolean;
  loadingChildren: Set<string>;
  expandedIds: Set<string>;
  selectedIds: Set<string>;
  focusedId: string | null;
  renamingId: string | null;
  treeAPI: TreeApi | null;
  toast: Toast | null;
  initTree: () => Promise<void>;
  loadChildren: (parentId: string | null) => Promise<void>;
  addItem: (item: NoteModel) => void;
  removeItem: (id: string) => Promise<void>;
  genNewId: () => string;
  moveItem: (data: TreeMoveRequest) => Promise<void>;
  mutateItem: (id: string, data: TreeItemUpdate) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  collapseAllItems: () => void;
  refreshTree: () => Promise<void>;
  setDependencies: (treeAPI: TreeApi, toast: Toast) => void;
  setExpandedIds: (ids: Set<string>) => void;
  setSelectedIds: (ids: Set<string>) => void;
  setFocusedId: (id: string | null) => void;
  setRenamingId: (id: string | null) => void;
}

const useNoteTreeStore = create<NoteTreeState>((set, get) => ({
  tree: DEFAULT_TREE,
  pinnedTree: DEFAULT_TREE,
  initLoaded: false,
  loading: false,
  loadingChildren: new Set<string>(),
  expandedIds: new Set<string>(),
  selectedIds: new Set<string>(),
  focusedId: null,
  renamingId: null,
  treeAPI: null,
  toast: null,

  setDependencies: (treeAPI, toast) => {
    set({ treeAPI, toast });
  },

  setExpandedIds: (ids: Set<string>) => {
    set({ expandedIds: ids });
  },

  setSelectedIds: (ids: Set<string>) => {
    set({ selectedIds: ids });
  },

  setFocusedId: (id: string | null) => {
    set({ focusedId: id });
  },

  setRenamingId: (id: string | null) => {
    set({ renamingId: id });
  },

  initTree: async () => {
    const { treeAPI, initLoaded, loading } = get();

    if (initLoaded || loading) return;

    if (!treeAPI) {
      console.warn("initTree called before dependencies were set — skipping");
      return;
    }

    set({ loading: true });

    try {
      const apiResponse = await treeAPI.fetch();
      if (!apiResponse) throw new Error("Tree request did not return a response");
      const items = apiResponse.items;

      const newTree = { ...DEFAULT_TREE, items: { ...DEFAULT_TREE.items } };
      const rootChildren: string[] = [];

      for (const item of items) {
        newTree.items[item.id] = buildTreeItemFromApi(item);
        rootChildren.push(item.id);
      }

      newTree.items[ROOT_ID].children = rootChildren;

      set({ ...treeState(newTree), initLoaded: true });
      await uiCache.setItem(TREE_CACHE_KEY, newTree);
    } catch (error) {
      console.error("Error initializing tree:", error);
      // Leave initLoaded unset after a failure so the caller can retry.
      const { toast: toastFn } = get();
      toastFn?.("Error loading notes", "error");
    } finally {
      set({ loading: false });
    }
  },

  loadChildren: async (parentId: string | null) => {
    const { treeAPI } = get();
    const parentKey = parentId || ROOT_ID;

    if (!treeAPI) {
      console.warn(
        "loadChildren called before dependencies were set — skipping",
      );
      return;
    }

    if (get().loadingChildren.has(parentKey)) return;

    const currentTree = get().tree;
    if (currentTree.items[parentKey]?.childrenLoaded) return;

    set((currentState) => {
      const loadingChildren = new Set(currentState.loadingChildren);
      loadingChildren.add(parentKey);
      return { loadingChildren };
    });

    try {
      const childrenResponse = await treeAPI.fetchChildren(parentId);

      if (childrenResponse && childrenResponse.items) {
        // Merge against the latest tree so simultaneous folder loads coexist.
        const latestTree = get().tree;
        const newTree = {
          ...latestTree,
          items: { ...latestTree.items },
        };
        const childIds: string[] = [];

        for (const item of childrenResponse.items) {
          newTree.items[item.id] = buildTreeItemFromApi(item);
          childIds.push(item.id);
        }

        if (newTree.items[parentKey]) {
          newTree.items[parentKey] = {
            ...newTree.items[parentKey],
            children: childIds,
            childrenLoaded: true,
          };
        }

        set(treeState(newTree));
        await uiCache.setItem(TREE_CACHE_KEY, newTree);
      }
    } catch (error) {
      console.error(`Error loading children for ${parentKey}:`, error);
      const { toast: toastFn } = get();
      toastFn?.("Failed to load folder contents", "error");
    } finally {
      set((currentState) => {
        const loadingChildren = new Set(currentState.loadingChildren);
        loadingChildren.delete(parentKey);
        return { loadingChildren };
      });
    }
  },

  addItem: (item: NoteModel) => {
    const currentTree = get().tree;
    const newTree = TreeActions.mutateItem(
      TreeActions.addItem(currentTree, item.id, item.pid),
      item.id,
      { data: item, isFolder: item.isFolder ?? false },
    );
    set(treeState(newTree));

    uiCache
      .setItem(TREE_CACHE_KEY, newTree)
      .catch((e) => console.error("Failed to cache tree after addItem:", e));
  },

  removeItem: async (id: string) => {
    const currentTree = get().tree;
    const newTree = TreeActions.removeItem(currentTree, id);

    set(treeState(newTree));

    await uiCache.setItem(TREE_CACHE_KEY, newTree);

    await Promise.all(
      TreeActions.flattenTree(newTree, id).map(
        async (item) =>
          await noteCache.mutateItem(item.id, {
            deleted: NOTE_DELETED.DELETED,
          }),
      ),
    );
  },

  genNewId: () => {
    let newId = genId();
    const currentTree = get().tree;
    while (currentTree.items[newId]) {
      newId = genId();
    }
    return newId;
  },

  moveItem: async (data) => {
    const state = get();
    const { treeAPI } = state;
    if (!treeAPI) return;
    const currentTree = get().tree;
    const newTree = TreeActions.moveItem(
      currentTree,
      data.source,
      data.destination,
    );

    // Keep the loaded note's parent in sync with the optimistic tree move.
    const movedId =
      currentTree.items[data.source.parentId]?.children[data.source.index];
    if (movedId && newTree.items[movedId]?.data) {
      const newPid =
        data.destination.parentId === ROOT_ID
          ? undefined
          : data.destination.parentId;
      newTree.items[movedId] = {
        ...newTree.items[movedId],
        data: { ...newTree.items[movedId].data!, pid: newPid },
      };
    }

    set(treeState(newTree));
    await uiCache.setItem(TREE_CACHE_KEY, newTree);

    try {
      await treeAPI.mutate({
        action: "move",
        data,
      });
    } catch {
      set(treeState(currentTree));
      await uiCache.setItem(TREE_CACHE_KEY, currentTree);
      const { toast: toastFn } = get();
      toastFn?.("Failed to move item", "error");
    }
  },

  mutateItem: async (id, data) => {
    const state = get();
    const { treeAPI } = state;
    const currentTree = get().tree;
    if (!currentTree.items[id]) return;
    const newTree = TreeActions.mutateItem(currentTree, id, data);
    set(treeState(newTree));
    if (data.isExpanded !== undefined) {
      const expandedIds = new Set(state.expandedIds);
      if (data.isExpanded) expandedIds.add(id);
      else expandedIds.delete(id);
      set({ expandedIds });
    }
    await uiCache.setItem(TREE_CACHE_KEY, newTree);
    if (data.isExpanded !== undefined) {
      if (!treeAPI) return;
      await treeAPI.mutate({
        action: "mutate",
        data: { id, isExpanded: data.isExpanded },
      });
    }
  },

  deleteItem: async (id: string) => {
    const currentTree = get().tree;
    const newTree = TreeActions.deleteItem(currentTree, id);
    set(treeState(newTree));
    await uiCache.setItem(TREE_CACHE_KEY, newTree);
  },

  collapseAllItems: () => {
    const currentTree = get().tree;
    const expandedItems = TreeActions.flattenTree(currentTree).filter(
      (item) => item.isExpanded,
    );
    void (async () => {
      // Each write updates the cached tree; serialize them so a later write never
      // persists an older snapshot over an earlier collapse.
      for (const item of expandedItems) {
        await get().mutateItem(item.id, { isExpanded: false });
      }
    })().catch((error) =>
      console.error("Failed to collapse tree items:", error),
    );
  },

  refreshTree: async () => {
    set({ initLoaded: false });
    await get().initTree();
  },
}));

export default useNoteTreeStore;
