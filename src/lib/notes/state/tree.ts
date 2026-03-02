// extracted from Notea (MIT License)
import { genId } from '@/lib/notes/utils/id';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createContainer } from 'unstated-next';
import TreeActions, {
    DEFAULT_TREE,
    MovePosition,
    ROOT_ID,
    TreeItemModel,
    TreeModel,
} from '@/lib/notes/types/tree';
import useNoteAPI from '../api/note';
import noteCache from '../cache/note';
import useTreeAPI from '../api/tree';
import { NOTE_DELETED, NOTE_PINNED } from '@/lib/notes/types/meta';
import { NoteModel } from '@/lib/notes/types/note';
import { useToast } from '../hooks/use-toast';
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

const useNoteTree = (initData: TreeModel = DEFAULT_TREE) => {
    const { mutate, loading, fetch: fetchTree } = useTreeAPI();
    const [tree, setTree] = useState<TreeModel>(initData);
    const [initLoaded, setInitLoaded] = useState<boolean>(false);
    const { fetch: fetchNote } = useNoteAPI();
    const treeRef = useRef(tree);
    const toast = useToast();

    useEffect(() => {
        treeRef.current = tree;
    }, [tree]);

     const fetchNotes = useCallback(
         async (tree: TreeModel) => {
             // Tree from API already includes note data in items
             // Only fetch missing notes
             const missingNotes = Object.values(tree.items).filter(item => !item.data);
             if (missingNotes.length > 0) {
                 await Promise.all(
                     missingNotes.map(async (item) => {
                         item.data = await fetchNote(item.id);
                     })
                 );
             }

             return tree;
         },
         [fetchNote]
     );

    const initTree = useCallback(async () => {
        try {
            // Try to use cached tree first
            const cache = await uiCache.getItem<TreeModel>(TREE_CACHE_KEY);
            if (cache && Object.keys(cache.items).length > 0) {
                setTree(cache);
                setInitLoaded(true);
            }

            // Fetch fresh tree from API
            const tree = await fetchTree();

            if (!tree || !tree.items || Object.keys(tree.items).length === 0) {
                console.warn('Failed to load tree or tree is empty');
                if (!cache) {
                    toast('Failed to load notes', 'error');
                }
                return;
            }

            // Fetch any missing notes
            const treeWithNotes = await fetchNotes(tree);

            setTree(treeWithNotes);
            await Promise.all([
                uiCache.setItem(TREE_CACHE_KEY, tree),
                noteCache.checkItems(tree.items),
            ]);
            setInitLoaded(true);
        } catch (error) {
            console.error('Error initializing tree:', error);
            toast('Error loading notes', 'error');
        }
    }, [fetchNotes, fetchTree, toast]);

    const addItem = useCallback((item: NoteModel) => {
        const tree = TreeActions.addItem(treeRef.current, item.id, item.pid);

        tree.items[item.id].data = item;
        setTree(tree);
    }, []);

     const removeItem = useCallback(async (id: string) => {
         const tree = TreeActions.removeItem(treeRef.current, id);

         setTree(tree);
         await Promise.all(
             TreeActions.flattenTree(tree, id).map(
                 async (item) =>
                     await noteCache.mutateItem(item.id, {
                         deleted: NOTE_DELETED.DELETED,
                     })
             )
         );
     }, []);

    const genNewId = useCallback(() => {
        let newId = genId();
        while (treeRef.current.items[newId]) {
            newId = genId();
        }
        return newId;
    }, []);

    const moveItem = useCallback(
        async (data: { source: MovePosition; destination: MovePosition }) => {
            const newTree = TreeActions.moveItem(
                treeRef.current,
                data.source,
                data.destination
            );
            setTree(newTree);
            
            // update cache with new tree state
            await uiCache.setItem(TREE_CACHE_KEY, newTree);
            
            await mutate({
                action: 'move',
                data,
            });
        },
        [mutate]
    );

    const mutateItem = useCallback(
        async (id: string, data: Partial<TreeItemModel>) => {
            const newTree = TreeActions.mutateItem(treeRef.current, id, data);
            setTree(newTree);
            
            // update cache with new tree state
            await uiCache.setItem(TREE_CACHE_KEY, newTree);
            
             delete data.data;
             // @todo diff 没有变化就不发送请求
             if (Object.keys(data).length > 0) {
                 await mutate({
                     action: 'mutate',
                     data: {
                         ...data,
                         id,
                     },
                 });
             }
        },
        [mutate]
    );

     const restoreItem = useCallback(async (id: string, pid: string) => {
         const tree = TreeActions.restoreItem(treeRef.current, id, pid);

         setTree(tree);
         await Promise.all(
             TreeActions.flattenTree(tree, id).map(
                 async (item) =>
                     await noteCache.mutateItem(item.id, {
                         deleted: NOTE_DELETED.NORMAL,
                     })
             )
         );
     }, []);

    const deleteItem = useCallback(async (id: string) => {
        setTree(TreeActions.deleteItem(treeRef.current, id));
    }, []);

    const getPaths = useCallback((note: NoteModel) => {
        const tree = treeRef.current;
        return findParentTreeItems(tree, note).map(
            (listItem) => listItem.data!
        );
    }, []);

     const setItemsExpandState = useCallback(
         async (items: TreeItemModel[], newValue: boolean) => {
             const newTree = items.reduce(
                 (tempTree, item) =>
                     TreeActions.mutateItem(tempTree, item.id, {
                         isExpanded: newValue,
                     }),
                 treeRef.current
             );
             setTree(newTree);

            for (const item of items) {
                await mutate({
                    action: 'mutate',
                    data: {
                        isExpanded: newValue,
                        id: item.id,
                    },
                });
            }
        },
        [mutate]
    );

    const showItem = useCallback(
        (note: NoteModel) => {
            const parents = findParentTreeItems(treeRef.current, note);
            setItemsExpandState(parents, true)
                ?.catch((v) => console.error('Error whilst expanding item: %O', v));
        },
        [setItemsExpandState]
    );

     const checkItemIsShown = useCallback((note: NoteModel) => {
         const parents = findParentTreeItems(treeRef.current, note);
         return parents.reduce(
             (value, item) => value && !!item.isExpanded,
             true
         );
     }, []);

    const collapseAllItems = useCallback(() => {
        const expandedItems = TreeActions.flattenTree(treeRef.current).filter(
            (item) => item.isExpanded
        );
        setItemsExpandState(expandedItems, false)
            .catch((v) => console.error('Error whilst collapsing item: %O', v));
    }, [setItemsExpandState]);

     const pinnedTree = useMemo(() => {
         const items = JSON.parse(JSON.stringify(tree.items));
         const pinnedIds: string[] = [];
         Object.values(items).forEach((item: TreeItemModel) => {
             if (
                 item.data?.pinned === NOTE_PINNED.PINNED &&
                 item.data.deleted !== NOTE_DELETED.DELETED
             ) {
                 pinnedIds.push(item.id);
             }
         });

         items[ROOT_ID] = {
             id: ROOT_ID,
             children: pinnedIds,
             isExpanded: true,
         };

         return {
             ...tree,
             items,
         };
     }, [tree]);

    return {
        tree,
        pinnedTree,
        initTree,
        genNewId,
        addItem,
        removeItem,
        moveItem,
        mutateItem,
        restoreItem,
        deleteItem,
        getPaths,
        showItem,
        checkItemIsShown,
        collapseAllItems,
        loading,
        initLoaded,
    };
};

const NoteTreeState = createContainer(useNoteTree);

export default NoteTreeState;
