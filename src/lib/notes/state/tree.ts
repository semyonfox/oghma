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
    // API instances for dependency injection
    treeAPI: any;
    noteAPI: any;
    toast: any;
    // Methods
    initTree: () => Promise<void>;
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
}

const useNoteTreeStore = create<NoteTreeState>((set, get) => ({
    tree: DEFAULT_TREE,
    pinnedTree: DEFAULT_TREE,
    initLoaded: false,
    loading: false,
    treeAPI: null,
    noteAPI: null,
    toast: null,

    setDependencies: (treeAPI: any, noteAPI: any, toast: any) => {
        set({ treeAPI, noteAPI, toast });
    },

    setLoading: (loading: boolean) => {
        set({ loading });
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

        try {
            let tree: TreeModel | null = null;

            // Try to use cached tree first for instant UI
            const cache = await uiCache.getItem<TreeModel>(TREE_CACHE_KEY);
            if (cache && Object.keys(cache.items).length > 0) {
                set({ tree: cache });
                tree = cache;
            }

            // Always fetch fresh tree from API
            const apiTree = await treeAPI.fetch();

            if (apiTree && apiTree.items && Object.keys(apiTree.items).length > 0) {
                // Fetch any missing notes (skip root node, it's virtual)
                const missingNotes = Object.values(apiTree.items).filter(
                    (item: any) => !item.data && item.id !== ROOT_ID
                );
                if (missingNotes.length > 0) {
                    await Promise.all(
                        missingNotes.map(async (item: any) => {
                            item.data = await noteAPI.fetch(item.id);
                        })
                    );
                }
                const treeWithNotes = apiTree;
                set({ tree: treeWithNotes });
                tree = treeWithNotes;

                // Update cache with fresh data
                await Promise.all([
                    uiCache.setItem(TREE_CACHE_KEY, treeWithNotes),
                    noteCache.checkItems(treeWithNotes.items),
                ]);
            } else if (!tree) {
                // No API tree and no cache
                console.warn('Failed to load tree or tree is empty');
                toast('Failed to load notes', 'error');
                set({ initLoaded: true });
                return;
            }

            // Successfully loaded tree (from cache or API)
            set({ initLoaded: true });
        } catch (error) {
            console.error('Error initializing tree:', error);
            const { toast: toastFn } = get();
            toastFn('Error loading notes', 'error');
            set({ initLoaded: true });
        }
    },

    addItem: (item: NoteModel) => {
        const currentTree = get().tree;
        const newTree = TreeActions.addItem(currentTree, item.id, item.pid);

        newTree.items[item.id].data = item;
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
