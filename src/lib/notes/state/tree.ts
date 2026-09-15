// extracted from Notea (MIT License)
import { create } from "zustand";
import { genId } from "@/lib/notes/utils/id";
import TreeActions, {
  createEmptyTree,
  ROOT_ID,
  type TreeItemUpdate,
  type TreeMoveRequest,
  type TreeModel,
} from "@/lib/notes/types/tree";
import type { TreeApi } from "../api/tree";
import type { NoteModel } from "@/lib/notes/types/note";
import { publishWorkspaceInvalidation } from "../workspace-invalidation";
import { buildPinnedTree, pruneTree, replaceTreeBranch, sortTreeChildren } from "./tree-utils";

type Toast = (message: string, type?: "error") => void;
type Operation = { generation: number; api: TreeApi; signal: AbortSignal; check: () => void };

export interface NoteTreeState {
  tree: TreeModel;
  pinnedTree: TreeModel;
  ownerUserId: string | null;
  generation: number;
  initLoaded: boolean;
  loading: boolean;
  error: string | null;
  loadingChildren: Set<string>;
  movingIds: Set<string>;
  expandedIds: Set<string>;
  selectedIds: Set<string>;
  focusedId: string | null;
  renamingId: string | null;
  treeAPI: TreeApi | null;
  toast: Toast | null;
  resetForSession: (userId: string | null) => void;
  initTree: () => Promise<void>;
  loadChildren: (parentId: string | null) => Promise<void>;
  refreshChildren: (parentId: string | null) => Promise<void>;
  refreshTreePaths: (paths: string[][]) => Promise<void>;
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

const useNoteTreeStore = create<NoteTreeState>((set, get) => {
  // One owner orders tree reads and writes. A refresh queued during a read
  // runs afterwards, so callers never acknowledge a pre-publication snapshot.
  let queue = Promise.resolve();
  const waiting = new Map<string | symbol, Promise<void>>();
  const controllers = new Set<AbortController>();
  let localChanges = 0;
  let initialRequest: Promise<void> | null = null;

  function enqueue(key: string | symbol, work: (operation: Operation) => Promise<void>): Promise<void> {
    const existing = waiting.get(key);
    if (existing) return existing;
    const generation = get().generation;
    const promise = queue.then(async () => {
      if (waiting.get(key) === promise) waiting.delete(key);
      const controller = new AbortController();
      const check = () => {
        if (get().generation !== generation || controller.signal.aborted) {
          throw new DOMException("Tree session changed", "AbortError");
        }
      };
      check();
      const api = get().treeAPI;
      if (!api) throw new Error("Tree is not ready");
      controllers.add(controller);
      try {
        await work({ generation, api, signal: controller.signal, check });
        check();
      } finally {
        controllers.delete(controller);
      }
    });
    waiting.set(key, promise);
    queue = promise.catch(() => {});
    return promise;
  }

  function apply(tree: TreeModel) {
    const clean = sortTreeChildren(pruneTree(tree));
    const exists = (id: string) => id !== ROOT_ID && Boolean(clean.items[id]);
    set((state) => ({
      tree: clean,
      pinnedTree: buildPinnedTree(clean),
      selectedIds: new Set([...state.selectedIds].filter(exists)),
      expandedIds: new Set([
        ...state.expandedIds,
        ...Object.values(clean.items).filter((item) => item.isExpanded && !state.tree.items[item.id]).map((item) => item.id),
      ].filter(exists)),
      focusedId: state.focusedId && exists(state.focusedId) ? state.focusedId : null,
      renamingId: state.renamingId && exists(state.renamingId) ? state.renamingId : null,
    }));
  }

  function report(generation: number, message: string) {
    if (generation !== get().generation) return;
    set({ error: message });
    get().toast?.(message, "error");
  }

  // A snapshot batch is assembled off-screen and committed once. If note CRUD
  // changes local state while it is read, start again after that committed write.
  async function reconcile(operation: Operation, groups: string[][], allLoaded = false) {
    for (;;) {
      operation.check();
      const version = localChanges;
      let draft = get().tree;
      const loaded = new Set(Object.values(draft.items)
        .filter((item) => item.childrenLoaded || get().expandedIds.has(item.id))
        .map((item) => item.id));
      const levels = groups.map((group) => [...new Set(group)]);
      const fetched = new Set<string>();
      for (let depth = 0; depth < levels.length; depth += 1) {
        operation.check();
        const reachable = pruneTree(draft).items;
        const parentIds = [...new Set(levels[depth])].filter((id) => reachable[id] && !fetched.has(id));
        // Bound network work for large imports while retaining parallel reads
        // of independent folders in a single atomic reconciliation.
        for (let start = 0; start < parentIds.length; start += 6) {
          operation.check();
          const snapshots = await Promise.all(parentIds.slice(start, start + 6).map(async (id) => {
            const response = id === ROOT_ID && allLoaded
              ? await operation.api.fetch(operation.signal)
              : await operation.api.fetchChildren(id === ROOT_ID ? null : id, operation.signal);
            operation.check();
            if (!response) throw new Error("Tree request did not return a response");
            return { id, items: response.items };
          }));
          for (const { id, items } of snapshots) {
            draft = replaceTreeBranch(draft, id, items);
            fetched.add(id);
            if (allLoaded) {
              const next = items.filter((item) => item.isFolder && loaded.has(item.id)).map((item) => item.id);
              if (next.length) (levels[depth + 1] ??= []).push(...next);
            }
          }
        }
      }
      operation.check();
      if (version !== localChanges) continue;
      apply(draft);
      set({ error: null });
      return;
    }
  }

  function freshTree() {
    return enqueue("refresh", async (operation) => {
      set({ loading: true });
      try {
        await reconcile(operation, [[ROOT_ID]], true);
        set({ initLoaded: true });
      } finally {
        if (operation.generation === get().generation) set({ loading: false });
      }
    });
  }

  function broadcast() {
    const userId = get().ownerUserId;
    if (userId) publishWorkspaceInvalidation(userId, "tree");
  }

  return {
    tree: createEmptyTree(),
    pinnedTree: createEmptyTree(),
    ownerUserId: null,
    generation: 0,
    initLoaded: false,
    loading: false,
    error: null,
    loadingChildren: new Set(),
    movingIds: new Set(),
    expandedIds: new Set(),
    selectedIds: new Set(),
    focusedId: null,
    renamingId: null,
    treeAPI: null,
    toast: null,

    resetForSession: (ownerUserId) => {
      for (const controller of controllers) controller.abort();
      controllers.clear();
      waiting.clear();
      queue = Promise.resolve();
      initialRequest = null;
      localChanges += 1;
      set({
        ownerUserId, generation: get().generation + 1,
        tree: createEmptyTree(), pinnedTree: createEmptyTree(),
        initLoaded: false, loading: false, error: null,
        loadingChildren: new Set(), movingIds: new Set(), expandedIds: new Set(), selectedIds: new Set(),
        focusedId: null, renamingId: null, treeAPI: null, toast: null,
      });
    },
    setDependencies: (treeAPI, toast) => set({ treeAPI, toast }),
    setExpandedIds: (ids) => set({
      expandedIds: new Set([...ids].filter((id) => id !== ROOT_ID && get().tree.items[id])),
    }),
    setSelectedIds: (ids) => set({
      selectedIds: new Set([...ids].filter((id) => id !== ROOT_ID && get().tree.items[id])),
    }),
    setFocusedId: (id) => set({ focusedId: id && id !== ROOT_ID && get().tree.items[id] ? id : null }),
    setRenamingId: (id) => set({ renamingId: id && id !== ROOT_ID && get().tree.items[id] ? id : null }),

    initTree: async () => {
      if (get().initLoaded) return;
      const generation = get().generation;
      if (!initialRequest) {
        const request = freshTree();
        initialRequest = request;
        void request.finally(() => {
          if (initialRequest === request) initialRequest = null;
        }).catch(() => {});
      }
      try { await initialRequest; }
      catch { report(generation, "Error loading notes"); }
    },

    refreshTree: async () => {
      const generation = get().generation;
      try { await freshTree(); }
      catch (error) {
        report(generation, "Error loading notes");
        throw error;
      }
    },

    loadChildren: async (parentId) => {
      const key = parentId ?? ROOT_ID;
      const generation = get().generation;
      try {
        await enqueue(`load:${key}`, async (operation) => {
          if (get().tree.items[key]?.childrenLoaded) return;
          if (!get().tree.items[key]) throw new Error("Tree parent is no longer loaded");
          set((state) => ({ loadingChildren: new Set([...state.loadingChildren, key]) }));
          try { await reconcile(operation, [[key]]); }
          finally {
            if (generation === get().generation) set((state) => ({
              loadingChildren: new Set([...state.loadingChildren].filter((id) => id !== key)),
            }));
          }
        });
      } catch { report(generation, "Failed to load folder contents"); }
    },

    refreshChildren: (parentId) => enqueue(`branch:${parentId ?? ROOT_ID}`, async (operation) => {
      const key = parentId ?? ROOT_ID;
      if (!get().tree.items[key]) throw new Error("Tree parent is no longer loaded");
      await reconcile(operation, [[key]]);
    }),

    refreshTreePaths: (paths) => {
      const groups: string[][] = [[ROOT_ID]];
      for (const path of paths) {
        for (let depth = 0; depth < path.length - 1; depth += 1) {
          (groups[depth + 1] ??= []).push(path[depth]);
        }
      }
      return enqueue(`paths:${JSON.stringify(paths)}`, async (operation) => {
        await reconcile(operation, groups);
        for (const path of paths) {
          let parent = ROOT_ID;
          for (const id of path) {
            if (!get().tree.items[parent]?.children.includes(id)) {
              throw new Error("Published tree path is not available yet");
            }
            parent = id;
          }
        }
      });
    },

    addItem: (item) => {
      localChanges += 1;
      apply(TreeActions.mutateItem(TreeActions.addItem(get().tree, item.id, item.pid), item.id,
        { data: item, isFolder: item.isFolder ?? false }));
    },

    removeItem: async (id) => {
      localChanges += 1;
      apply(TreeActions.removeItem(get().tree, id));
    },

    genNewId: () => {
      let id = genId();
      while (get().tree.items[id]) id = genId();
      return id;
    },

    moveItem: async (data) => {
      if (data.parentId === data.expectedParentId || get().movingIds.has(data.noteId)) return;
      const generation = get().generation;
      set((state) => ({ movingIds: new Set([...state.movingIds, data.noteId]) }));
      try {
        await enqueue(`move:${data.noteId}`, async (operation) => {
          try {
            const result = await operation.api.mutate({ action: "move", data }, operation.signal);
            operation.check();
            if (!result || !("noteId" in result) || result.noteId !== data.noteId) {
              throw new Error("Move did not return its canonical result");
            }
            broadcast();
          } catch (error) {
            operation.check();
            // The server may have committed before the connection failed.
            // Re-read current state, never restore a captured graph.
            broadcast();
            await reconcile(operation, [[ROOT_ID], [data.expectedParentId ?? ROOT_ID, data.parentId ?? ROOT_ID]], true);
            throw error;
          }
          await reconcile(operation, [[ROOT_ID], [data.expectedParentId ?? ROOT_ID, data.parentId ?? ROOT_ID]], true);
        });
      } catch { report(generation, "Failed to move item. Refresh notes to check its location."); }
      finally {
        if (generation === get().generation) set((state) => ({
          movingIds: new Set([...state.movingIds].filter((id) => id !== data.noteId)),
        }));
      }
    },

    mutateItem: async (id, data) => {
      if (!get().tree.items[id]) return;
      localChanges += 1;
      apply(TreeActions.mutateItem(get().tree, id, data));
      if (data.isExpanded === undefined) return;
      const isExpanded = data.isExpanded;
      const expandedIds = new Set(get().expandedIds);
      if (isExpanded) expandedIds.add(id); else expandedIds.delete(id);
      set({ expandedIds });
      const generation = get().generation;
      try {
        await enqueue(Symbol(`expand:${id}`), async (operation) => {
          const result = await operation.api.mutate({ action: "mutate", data: { id, isExpanded } }, operation.signal);
          operation.check();
          if (!result) throw new Error("Expansion did not return a response");
        });
      } catch { report(generation, "Failed to save folder expansion"); }
    },

    deleteItem: async (id) => {
      localChanges += 1;
      apply(TreeActions.deleteItem(get().tree, id));
    },

    collapseAllItems: () => {
      const ids = [...get().expandedIds];
      for (const id of ids) void get().mutateItem(id, { isExpanded: false });
      set({ expandedIds: new Set() });
    },
  };
});

export default useNoteTreeStore;
