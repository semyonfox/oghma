// extracted from Notea (MIT License)
import { create } from 'zustand';
import { genId } from '@/lib/notes/utils/id';
import TreeActions, {
    DEFAULT_TREE,
    MovePosition,
    ROOT_ID,
    TreeItemModel,
    TreeModel,
} from '@/lib/notes/types/tree';
import noteCache from '../cache/note';
import { NOTE_DELETED, NOTE_PINNED } from '@/lib/notes/types/meta';
import { NoteModel } from '@/lib/notes/types/note';
import { uiCache } from '../cache';

const TREE_CACHE_KEY = 'tree';

const findParentTreeItems = (tree: TreeModel, note: NoteModel) => {
    const parents = [] as TreeItemModel[];

    let tempNote = note;
    while (tempNote.pid && tempNote.pid !== ROOT_ID) {
        const curData = tree.items[tempNote.pid];
        if (curData?.data) {
            tempNote = curData.data;
            parents.push(curData);
        } else {
            break;
        }
    }

    return parents;
};

export interface NoteTreeState {
    tree: TreeModel;
    pinnedTree: TreeModel;
    initLoaded: boolean;
    loading: boolean;
    loadingChildren: Set<string>; // Track which folders are currently loading children
    // View state for react-complex-tree
    expandedIds: Set<string>;
    selectedIds: Set<string>;
    focusedId: string | null;
    // API instances for dependency injection
    treeAPI: any;
    noteAPI: any;
    toast: any;
    // Methods
    initTree: () => Promise<void>;
    loadChildren: (parentId: string | null) => Promise<void>; // Lazy-load children for a folder
    fetchNotes: (tree: TreeModel) => Promise<TreeModel>;
    addItem: (item: NoteModel) => void;
    removeItem: (id: string) => Promise<void>;
    genNewId: () => string;
    moveItem: (data: { source: MovePosition; destination: MovePosition }) => Promise<void>;
    mutateItem: (id: string, data: Partial<TreeItemModel>) => Promise<void>;
    restoreItem: (id: string, pid: string) => Promise<void>;
    deleteItem: (id: string) => Promise<void>;
    getPaths: (note: NoteModel) => NoteModel[];
    setItemsExpandState: (items: TreeItemModel[], newValue: boolean) => Promise<void>;
    showItem: (note: NoteModel) => void;
    checkItemIsShown: (note: NoteModel) => boolean;
    collapseAllItems: () => void;
    setLoading: (loading: boolean) => void;
    setDependencies: (treeAPI: any, noteAPI: any, toast: any) => void;
    // View state setters for react-complex-tree
    setExpandedIds: (ids: Set<string>) => void;
    setSelectedIds: (ids: Set<string>) => void;
    setFocusedId: (id: string | null) => void;
}

const useNoteTreeStore = create<NoteTreeState>((set, get) => ({
    tree: DEFAULT_TREE,
    pinnedTree: DEFAULT_TREE,
    initLoaded: false,
    loading: false,
    loadingChildren: new Set<string>(),
    // View state for react-complex-tree
    expandedIds: new Set<string>(),
    selectedIds: new Set<string>(),
    focusedId: null,
    treeAPI: null,
    noteAPI: null,
    toast: null,

    setDependencies: (treeAPI: any, noteAPI: any, toast: any) => {
        set({ treeAPI, noteAPI, toast });
    },

    setLoading: (loading: boolean) => {
        set({ loading });
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

    fetchNotes: async (tree: TreeModel) => {
        const state = get();
        // Tree from API already includes note data in items
        // Only fetch missing notes, but skip root node (it's virtual)
        const missingNotes = Object.values(tree.items).filter(
            item => !item.data && item.id !== ROOT_ID
        );
        if (missingNotes.length > 0) {
            await Promise.all(
                missingNotes.map(async (item) => {
                    item.data = await state.noteAPI.fetch(item.id);
                })
            );
        }

        return tree;
    },

    initTree: async () => {
        const state = get();
        const { treeAPI, noteAPI, toast, initLoaded } = state;

        // Skip if already initialized to prevent overwriting locally added notes
        // with cached API responses
        if (initLoaded) {
            return;
        }

        // guard: dependencies must be injected before initTree is called
        if (!treeAPI || !noteAPI) {
            console.warn('initTree called before dependencies were set — skipping');
            return;
        }

        try {
            // Fetch only root items from API (lazy-loading)
            const apiResponse = await treeAPI.fetch();

            // apiResponse may be null (network failure) or have items: [] (empty account)
            // Both are handled gracefully — empty is NOT an error
            const items = apiResponse?.items ?? [];

            const newTree = { ...DEFAULT_TREE, items: { ...DEFAULT_TREE.items } };
            const rootChildren: string[] = [];

            for (const item of items) {
                const treeItem: TreeItemModel = {
                    id: item.id,
                    children: [], // loaded lazily on folder expand
                    isExpanded: item.isExpanded ?? false,
                    isChildrenLoading: false,
                    isFolder: item.isFolder ?? false,
                };
                newTree.items[item.id] = treeItem;
                rootChildren.push(item.id);
            }

            newTree.items[ROOT_ID].children = rootChildren;

            if (items.length > 0) {
                // Fetch note data for all root items in parallel
                const noteResults = await Promise.all(
                    items.map((item: any) =>
                        noteAPI.fetch(item.id)
                            .then((noteData: NoteModel) => ({ id: item.id, data: noteData }))
                            .catch((e: any) => {
                                console.error(`Failed to fetch note ${item.id}:`, e);
                                return null;
                            })
                    )
                );
                for (const result of noteResults) {
                    if (result && newTree.items[result.id]) {
                        newTree.items[result.id].data = result.data;
                    }
                }
            }

            set({ tree: newTree, initLoaded: true });

            // persist tree structure to IndexedDB for instant load on next visit
            await uiCache.setItem(TREE_CACHE_KEY, newTree);
        } catch (error) {
            console.error('Error initializing tree:', error);
            // don't set initLoaded on failure so the caller can retry
            const { toast: toastFn } = get();
            toastFn?.('Error loading notes', 'error');
        }
    },

    loadChildren: async (parentId: string | null) => {
        const state = get();
        const { treeAPI, noteAPI, toast } = state;
        const parentKey = parentId || ROOT_ID;

        if (!treeAPI || !noteAPI) {
            console.warn('loadChildren called before dependencies were set — skipping');
            return;
        }

        // Skip if already loading
        if (state.loadingChildren.has(parentKey)) {
            return;
        }

        // Skip if already loaded
        const currentTree = get().tree;
        if (currentTree.items[parentKey]?.children.length > 0) {
            return;
        }

        try {
            // Mark as loading
            const newLoadingChildren = new Set(state.loadingChildren);
            newLoadingChildren.add(parentKey);
            set({ loadingChildren: newLoadingChildren });

            // Fetch children from API
            const childrenResponse = await treeAPI.fetchChildren(parentId);

            if (childrenResponse && childrenResponse.items) {
                const newTree = { ...currentTree, items: { ...currentTree.items } };
                const childIds: string[] = [];

                for (const item of childrenResponse.items) {
                    const treeItem: TreeItemModel = {
                        id: item.id,
                        children: [], // Children of children will be loaded on their expansion
                        isExpanded: item.isExpanded ?? false,
                        isChildrenLoading: false,
                        isFolder: item.isFolder ?? false,
                    };
                    newTree.items[item.id] = treeItem;
                    childIds.push(item.id);
                }

                // Update parent's children list
                if (newTree.items[parentKey]) {
                    newTree.items[parentKey] = {
                        ...newTree.items[parentKey],
                        children: childIds,
                    };
                }

                // Fetch note data for children
                const notePromises = childrenResponse.items.map((item: any) =>
                    noteAPI.fetch(item.id)
                        .then((noteData: NoteModel) => ({
                            id: item.id,
                            data: noteData,
                        }))
                        .catch((e: any) => {
                            console.error(`Failed to fetch note ${item.id}:`, e);
                            return null;
                        })
                );

                const noteResults = await Promise.all(notePromises);
                for (const result of noteResults) {
                    if (result && newTree.items[result.id]) {
                        newTree.items[result.id].data = result.data;
                    }
                }

                set({ tree: newTree });
                await uiCache.setItem(TREE_CACHE_KEY, newTree);
            }

            // Mark as done loading
            const finalLoadingChildren = new Set(state.loadingChildren);
            finalLoadingChildren.delete(parentKey);
            set({ loadingChildren: finalLoadingChildren });
        } catch (error) {
            console.error(`Error loading children for ${parentKey}:`, error);
            const { toast: toastFn } = get();
            toastFn(`Failed to load folder contents`, 'error');

            // Mark as done loading even on error
            const finalLoadingChildren = new Set(state.loadingChildren);
            finalLoadingChildren.delete(parentKey);
            set({ loadingChildren: finalLoadingChildren });
        }
    },

    addItem: (item: NoteModel) => {
        const currentTree = get().tree;
        const newTree = TreeActions.addItem(currentTree, item.id, item.pid);

        newTree.items[item.id].data = item;
        newTree.items[item.id].isFolder = item.isFolder ?? false;
        set({ tree: newTree });

        // persist tree to IndexedDB cache
        uiCache.setItem(TREE_CACHE_KEY, newTree).catch(
            (e) => console.error('Failed to cache tree after addItem:', e)
        );
    },

    removeItem: async (id: string) => {
        const currentTree = get().tree;
        const newTree = TreeActions.removeItem(currentTree, id);

        set({ tree: newTree });

        // persist tree to IndexedDB cache
        await uiCache.setItem(TREE_CACHE_KEY, newTree);

        await Promise.all(
            TreeActions.flattenTree(newTree, id).map(
                async (item) =>
                    await noteCache.mutateItem(item.id, {
                        deleted: NOTE_DELETED.DELETED,
                    })
            )
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

    moveItem: async (data: { source: MovePosition; destination: MovePosition }) => {
        const state = get();
        const { treeAPI } = state;
        const currentTree = get().tree;
        const newTree = TreeActions.moveItem(
            currentTree,
            data.source,
            data.destination
        );
        set({ tree: newTree });

        // update cache with new tree state
        await uiCache.setItem(TREE_CACHE_KEY, newTree);

        await treeAPI.mutate({
            action: 'move',
            data,
        });
    },

    mutateItem: async (id: string, data: Partial<TreeItemModel>) => {
        const state = get();
        const { treeAPI } = state;
        const currentTree = get().tree;
        const newTree = TreeActions.mutateItem(currentTree, id, data);
        set({ tree: newTree });

        // sync expanded state with react-complex-tree
        if (data.isExpanded !== undefined) {
            const newExpandedIds = new Set(state.expandedIds);
            if (data.isExpanded) {
                newExpandedIds.add(id);
            } else {
                newExpandedIds.delete(id);
            }
            set({ expandedIds: newExpandedIds });
        }

        // update cache with new tree state
        await uiCache.setItem(TREE_CACHE_KEY, newTree);

        delete data.data;
        // @todo diff 没有变化就不发送请求
        if (Object.keys(data).length > 0) {
            await treeAPI.mutate({
                action: 'mutate',
                data: {
                    ...data,
                    id,
                },
            });
        }
    },

    restoreItem: async (id: string, pid: string) => {
        const currentTree = get().tree;
        const newTree = TreeActions.restoreItem(currentTree, id, pid);

        set({ tree: newTree });
        await Promise.all(
            TreeActions.flattenTree(newTree, id).map(
                async (item) =>
                    await noteCache.mutateItem(item.id, {
                        deleted: NOTE_DELETED.NORMAL,
                    })
            )
        );
    },

    deleteItem: async (id: string) => {
        const currentTree = get().tree;
        const newTree = TreeActions.deleteItem(currentTree, id);
        set({ tree: newTree });

        // persist tree to IndexedDB cache
        await uiCache.setItem(TREE_CACHE_KEY, newTree);
    },

    getPaths: (note: NoteModel) => {
        const currentTree = get().tree;
        return findParentTreeItems(currentTree, note).map(
            (listItem) => listItem.data!
        );
    },

    setItemsExpandState: async (items: TreeItemModel[], newValue: boolean) => {
        const state = get();
        const { treeAPI } = state;
        const currentTree = get().tree;
        const newTree = items.reduce(
            (tempTree, item) =>
                TreeActions.mutateItem(tempTree, item.id, {
                    isExpanded: newValue,
                }),
            currentTree
        );
        set({ tree: newTree });

        for (const item of items) {
            await treeAPI.mutate({
                action: 'mutate',
                data: {
                    isExpanded: newValue,
                    id: item.id,
                },
            });
        }
    },

    showItem: (note: NoteModel) => {
        const currentTree = get().tree;
        const parents = findParentTreeItems(currentTree, note);
        get().setItemsExpandState(parents, true)
            ?.catch((v) => console.error('Error whilst expanding item: %O', v));
    },

    checkItemIsShown: (note: NoteModel) => {
        const currentTree = get().tree;
        const parents = findParentTreeItems(currentTree, note);
        return parents.reduce(
            (value, item) => value && !!item.isExpanded,
            true
        );
    },

    collapseAllItems: () => {
        const currentTree = get().tree;
        const expandedItems = TreeActions.flattenTree(currentTree).filter(
            (item) => item.isExpanded
        );
        get().setItemsExpandState(expandedItems, false)
            .catch((v) => console.error('Error whilst collapsing item: %O', v));
    },
}));

// TODO: Implement pinnedTree computation with proper Zustand v5 API
// Currently disabled to allow build to succeed

export default useNoteTreeStore;
