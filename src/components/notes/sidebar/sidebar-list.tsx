// rewritten for react-complex-tree + App Router + Tailwind
import SidebarListItem from './sidebar-list-item';
import NoteContextMenu from './note-context-menu';
import useNoteTreeStore from '@/lib/notes/state/tree';
import useNoteStore from '@/lib/notes/state/note';
import useLayoutStore from '@/lib/notes/state/layout.zustand';
import { buildFileSpec } from '@/lib/notes/utils/file-spec';
import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import IconButton from '@/components/icon-button';
import useI18n from '@/lib/notes/hooks/use-i18n';
import { Favorites } from './favorites';
import {
    ControlledTreeEnvironment,
    Tree,
    TreeItemIndex,
} from 'react-complex-tree';
import 'react-complex-tree/lib/style.css';
import { NOTE_PINNED, NOTE_DELETED, NOTE_SHARED } from '@/lib/notes/types/meta';
import { NoteModel } from '@/lib/notes/types/note';

import CreateNoteModal from '@/components/notes/create-note-modal';

const SidebarList = () => {
    const { t } = useI18n();
    const router = useRouter();
    const {
        tree,
        moveItem,
        mutateItem,
        initLoaded,
        collapseAllItems,
        genNewId,
        loadChildren,
        expandedIds,
        setExpandedIds,
        selectedIds,
        setSelectedIds,
        focusedId,
        setFocusedId,
    } = useNoteTreeStore();
    const { createNote, createFolder, mutateNote, removeNote } = useNoteStore();
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // convert flat tree to react-complex-tree format: { [id]: { index, canMove, children } }
    const treeData = useMemo(() => {
        const result: Record<string, any> = {};

        // Add root
        const root = tree.items['root'];
        if (root) {
            result['root'] = {
                index: 'root',
                canMove: false,
                children: root.children,
                isFolder: true,
            };
        }

        // Add all other items
        for (const id in tree.items) {
            if (id === 'root') continue;
            const item = tree.items[id];
            if (!item) continue;

            const hasChildren = item.children.length > 0;
            const isFolder = item.isFolder || item.data?.isFolder || hasChildren;

            result[id] = {
                index: id,
                canMove: true,
                canRename: true,
                children: item.children,
                data: item.data,
                isFolder,
            };
        }

        return result;
    }, [tree]);

    // react-complex-tree callback: when a folder is expanded and children are missing, load them
    const onMissingItems = useCallback(
        async (itemIds: TreeItemIndex[]) => {
            for (const itemId of itemIds) {
                if (typeof itemId === 'string') {
                    const item = tree.items[itemId];
                    if (item && item.isFolder && item.children.length === 0) {
                        await loadChildren(itemId).catch((e) =>
                            console.error(`Error loading children for ${itemId}:`, e)
                        );
                    }
                }
            }
        },
        [tree.items, loadChildren]
    );

    // react-complex-tree callback: when a folder expands
    const handleExpandItem = useCallback(
        (item: any) => {
            const itemId = item.index;
            if (typeof itemId === 'string') {
                mutateItem(itemId, { isExpanded: true }).catch((v) =>
                    console.error('Error expanding item:', v)
                );
            }
        },
        [mutateItem]
    );

    // react-complex-tree callback: when a folder collapses
    const handleCollapseItem = useCallback(
        (item: any) => {
            const itemId = item.index;
            if (typeof itemId === 'string') {
                mutateItem(itemId, { isExpanded: false }).catch((v) =>
                    console.error('Error collapsing item:', v)
                );
            }
        },
        [mutateItem]
    );

    // react-complex-tree callback: when items are dropped on a new parent
    const handleDrop = useCallback(
        (draggedItems: any[], target: any) => {
            if (draggedItems.length === 0) {
                return;
            }

            // read current tree from store to find source position
            const currentItems = useNoteTreeStore.getState().tree.items;
            const dragId = draggedItems[0]?.index;

            if (typeof dragId !== 'string') {
                return;
            }

            const dragItem = currentItems[dragId];
            const dragData = dragItem?.data;
            const dragIsFolder = dragItem?.isFolder || dragData?.isFolder || false;

            const parentById: Record<string, string> = {};
            for (const itemId in currentItems) {
                const item = currentItems[itemId];
                for (const childId of item.children) {
                    parentById[childId] = itemId;
                }
            }

            const sourceParentId = parentById[dragId];
            if (!sourceParentId) {
                console.error("Can't find source parent for drag item", dragId);
                return;
            }
            const sourceIndex = currentItems[sourceParentId]?.children.indexOf(dragId) ?? -1;
            if (sourceIndex === -1) {
                console.error("Can't find source item index", dragId);
                return;
            }

            const targetType = target.targetType as string | undefined;
            let destinationParentId = '';
            let destinationIndex = 0;

            if (targetType === 'root') {
                destinationParentId = 'root';
                destinationIndex = currentItems['root']?.children.length ?? 0;
             } else if (targetType === 'item') {
                 const targetItemId = target.targetItem;
                 if (typeof targetItemId !== 'string') {
                     console.error('Invalid target item ID');
                     return;
                 }
                 const targetItem = currentItems[targetItemId];
                 if (!targetItem) {
                     console.error('Target item not found in tree', targetItemId);
                     return;
                 }
                 
                 // Check if target is a folder: has children OR explicitly marked as folder
                 const hasChildren = (targetItem.children && targetItem.children.length > 0);
                 const targetIsFolder = targetItem?.isFolder || targetItem?.data?.isFolder || hasChildren;

                  // If dropping on a folder, put it inside the folder
                  // Otherwise, put it after the target item at the same level
                  if (targetIsFolder) {
                      destinationParentId = targetItemId;
                      destinationIndex = targetItem.children?.length ?? 0;
                  } else {
                      const parentItemId = parentById[targetItemId];
                      if (!parentItemId) {
                          console.error('Cannot find parent of target item', targetItemId);
                          return;
                      }
                      destinationParentId = parentItemId;
                      const targetIndex = currentItems[destinationParentId]?.children.indexOf(targetItemId) ?? -1;
                      // Place right after the target item
                      destinationIndex = targetIndex >= 0 ? targetIndex + 1 : (currentItems[destinationParentId]?.children.length ?? 0);
                  }
                 
                 if (typeof destinationParentId !== 'string') {
                     console.error('Invalid destination parent ID');
                     return;
                 }
             } else if (targetType === 'between-items') {
                 const parentItemId = target.parentItem;
                 if (typeof parentItemId !== 'string') {
                     console.error('Invalid parent item ID for between-items drop');
                     return;
                 }
                 destinationParentId = parentItemId;
                 destinationIndex = target.childIndex ?? 0;
             } else {
                 console.warn('Unknown drop target type:', targetType);
                 return;
             }

             // Prevent moving a folder into itself or its descendants
             if (dragIsFolder) {
                 let cursor: string | undefined = destinationParentId;
                 while (cursor && cursor !== 'root') {
                     if (cursor === dragId) {
                         console.error('Cannot move folder into itself or its descendants');
                         return;
                     }
                     cursor = parentById[cursor];
                 }
             }

              // Prevent dropping an item in the same location (no-op move)
              if (sourceParentId === destinationParentId && sourceIndex === destinationIndex) {
                  return;
              }

             moveItem({
                 source: {
                     parentId: sourceParentId,
                     index: sourceIndex,
                 },
                 destination: {
                     parentId: destinationParentId,
                     index: destinationIndex,
                 },
             }).catch((e) => {
                 console.error('Move failed:', e);
             });
        },
        [moveItem]
    );

    const handleCreateNote = useCallback(
        async (title: string, language: string) => {
            const newNote = await createNote({
                title: title,
                content: '\n',
                pid: undefined,
            });

            if (newNote) {
                router.push(`/notes/${newNote.id}`);
            }
        },
        [createNote, router]
    );

    const handleCreateFolderFromModal = useCallback(
        async () => {
            const newFolder = await createFolder(undefined);
            // Don't navigate - let them create more items in the folder
        },
        [createFolder]
    );

    const handleUploadFile = useCallback(async (file: File) => {
        const fileName = file.name || 'Untitled';
        const ext = fileName.split('.').pop()?.toLowerCase() ?? '';

        // determine file type for the renderer
        let fileType: 'note' | 'pdf' | 'image' | 'video' = 'note';
        if (ext === 'pdf') fileType = 'pdf';
        else if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) fileType = 'image';
        else if (['mp4', 'webm', 'ogg', 'mov'].includes(ext)) fileType = 'video';

        // upload file to S3 via the upload API
        const formData = new FormData();
        formData.append('file', file);
        const noteId = genNewId();
        formData.append('noteId', noteId);

        const uploadRes = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
        });

        if (!uploadRes.ok) {
            console.error('Upload failed:', await uploadRes.text());
            return;
        }

        const uploadData = await uploadRes.json();

        // create a note record so it appears in the tree
        // for non-markdown files, store the S3 path as content so the viewer can retrieve it
        const content = fileType === 'note'
            ? (await file.text())
            : uploadData.path;

        const newNote = await createNote({
            id: noteId,
            title: fileName,
            content,
        });

        if (newNote) {
            router.push(`/notes/${newNote.id}`);
        }
    }, [genNewId, createNote, router]);

    // collapse all: clear expanded IDs and sync to application state
    const handleCollapseAll = useCallback(() => {
        setExpandedIds(new Set());
        collapseAllItems();
    }, [collapseAllItems, setExpandedIds]);

    // context menu handlers
    const handleRename = useCallback((id: string) => {
        setRenamingId(id);
    }, []);

    const handleDelete = useCallback(
        async (id: string) => {
            // Guard: ensure store is ready before allowing delete
            if (!initLoaded) {
                alert('Please wait for notes to load before deleting.');
                return;
            }

            if (confirm(`Are you sure you want to delete this ${tree.items[id]?.children.length > 0 ? 'folder and all its contents' : 'note'}?`)) {
                await removeNote(id);
            }
        },
        [removeNote, tree.items, initLoaded]
    );

    const handleDuplicate = useCallback(
        async (id: string) => {
            const original = tree.items[id];
            if (!original?.data) return;

            const newNote = await createNote({
                title: `${original.data.title} (Copy)`,
                content: original.data.content || '\n',
                pid: original.data.pid,
            });

            if (newNote) {
                router.push(`/notes/${newNote.id}`);
            }
        },
        [tree.items, createNote, router]
    );

    const handleTogglePin = useCallback(
        async (id: string) => {
            const item = tree.items[id];
            if (!item?.data) return;

            const newPinned = item.data.pinned === NOTE_PINNED.PINNED 
                ? NOTE_PINNED.UNPINNED 
                : NOTE_PINNED.PINNED;

            await mutateNote(id, { pinned: newPinned });
        },
        [tree.items, mutateNote]
    );

    const handleContextCreateNote = useCallback(
        async (parentId: string) => {
            // If creating at root level, don't specify pid
            const pid = parentId === 'root' ? undefined : parentId;
            const newNote = await createNote({
                title: 'Untitled',
                content: '\n',
                pid,
            });

            if (newNote) {
                // Only expand/mutate if not creating at root
                if (parentId !== 'root') {
                    const newExpandedIds = new Set(expandedIds);
                    newExpandedIds.add(parentId);
                    setExpandedIds(newExpandedIds);
                    await mutateItem(parentId, {
                        isExpanded: true,
                    });
                }
                router.push(`/notes/${newNote.id}`);
            }
        },
        [createNote, mutateItem, router, expandedIds, setExpandedIds]
    );

    const handleCreateFolder = useCallback(
        async (parentId: string) => {
            // If creating at root level, pass undefined as parentId
            const pid = parentId === 'root' ? undefined : parentId;
            const newFolder = await createFolder(pid);

            if (newFolder) {
                // Only expand/mutate if not creating at root
                if (parentId !== 'root') {
                    const newExpandedIds = new Set(expandedIds);
                    newExpandedIds.add(parentId);
                    setExpandedIds(newExpandedIds);
                    await mutateItem(parentId, {
                        isExpanded: true,
                    });
                }
            }
        },
        [createFolder, mutateItem, expandedIds, setExpandedIds]
    );

    const handleOpenInSplit = useCallback((id: string) => {
        const item = tree.items[id];
        if (!item?.data) return;
        const { setPaneB, setActivePane } = useLayoutStore.getState();
        setPaneB(buildFileSpec(item.data));
        setActivePane('B');
    }, [tree.items]);

    // build viewState object for react-complex-tree
    const viewState = useMemo(
        () => ({
            'notes-tree': {
                expandedItems: Array.from(expandedIds) as TreeItemIndex[],
                selectedItems: Array.from(selectedIds) as TreeItemIndex[],
                focusedItem: focusedId as TreeItemIndex | undefined,
            },
        }),
        [expandedIds, selectedIds, focusedId]
    );

    return (
        <>
            <section
                className="h-full flex text-sm flex-col flex-grow bg-gray-900 overflow-y-auto"
                aria-label="Notes list"
            >
                {/* Tree Section Header */}
                <div
                    className="p-2 text-gray-400 flex items-center sticky top-0 bg-gray-900 z-10"
                    role="toolbar"
                    aria-label="Notes actions"
                >
                    <div className="flex-auto flex items-center">
                        <span id="my-pages-label">{t('My Pages')}</span>
                        {initLoaded ? null : (
                            <svg
                                className="ml-4 animate-spin h-3.5 w-3.5 text-gray-400"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                            >
                                <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                />
                                <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                            </svg>
                        )}
                    </div>
                    <IconButton
                        icon="ChevronDoubleUp"
                        onClick={handleCollapseAll}
                        className="text-gray-400 hover:text-white w-5 h-5 md:w-5 md:h-5 transition-colors"
                        title={t('Collapse all pages')}
                        aria-label={t('Collapse all pages')}
                    />
                    <IconButton
                        icon="Plus"
                        onClick={() => setIsModalOpen(true)}
                        className="text-gray-400 hover:text-white transition-colors"
                        title={t('Create page')}
                        aria-label={t('Create page')}
                    />
                </div>

                {/* Tree Container */}
                <NoteContextMenu
                    noteId="root"
                    isFolder
                    isPinned={false}
                    onRename={handleRename}
                    onDelete={handleDelete}
                    onDuplicate={handleDuplicate}
                    onTogglePin={handleTogglePin}
                    onCreateNote={handleContextCreateNote}
                    onCreateFolder={handleCreateFolder}
                    onOpenInSplit={handleOpenInSplit}
                >
                    <div className="flex-grow pb-10 overflow-hidden">
                        <ControlledTreeEnvironment
                            items={treeData}
                            getItemTitle={(item) => item.data?.title ?? 'Untitled'}
                            viewState={viewState}
                            onExpandItem={handleExpandItem}
                            onCollapseItem={handleCollapseItem}
                            onSelectItems={(items) => setSelectedIds(new Set(items as string[]))}
                            onFocusItem={(item) => setFocusedId(item?.index as string | null)}
                            onDrop={handleDrop}
                            onMissingItems={onMissingItems}
                            canDragAndDrop
                            canReorderItems
                            canDropOnFolder
                            canDropOnNonFolder={false}
                            canDropBelowOpenFolders
                            canDropAt={(items, target: any) => {
                                if (target.targetType === 'item') {
                                    const targetItem = treeData[target.targetItem as string];
                                    return !!targetItem?.isFolder;
                                }
                                return true;
                            }}
                        >
                            <Tree
                                treeId="notes-tree"
                                rootItem="root"
                                treeLabel={t('My Pages')}
                                renderItem={({ item, depth, children, arrow, context }) => {
                                    const nodeData = item.data as any;
                                    const hasChildren = !!(item.children && item.children.length > 0);
                                    const isFolder = item.isFolder || nodeData?.isFolder || hasChildren;
                                    const isPinned = nodeData?.pinned === NOTE_PINNED.PINNED;
                                    const isDragging = (context as any)?.isDragging === true;
                                    const itemData = nodeData
                                        ? ({ ...nodeData, isFolder } as NoteModel)
                                        : ({
                                            id: item.index,
                                            title: 'Untitled',
                                            deleted: NOTE_DELETED.NORMAL,
                                            shared: NOTE_SHARED.PRIVATE,
                                            pinned: NOTE_PINNED.UNPINNED,
                                            editorsize: null,
                                            isFolder,
                                        } as NoteModel);

                                    return (
                                        <div
                                            {...context.itemContainerWithChildrenProps}
                                            className="flex flex-col"
                                        >
                                            <NoteContextMenu
                                                noteId={item.index as string}
                                                isFolder={isFolder}
                                                isPinned={isPinned}
                                                onRename={handleRename}
                                                onDelete={handleDelete}
                                                onDuplicate={handleDuplicate}
                                                onTogglePin={handleTogglePin}
                                                onCreateNote={handleContextCreateNote}
                                                onCreateFolder={handleCreateFolder}
                                                onOpenInSplit={handleOpenInSplit}
                                            >
                                                <div
                                                    {...context.itemContainerWithoutChildrenProps}
                                                    className="flex items-center gap-1 px-2 py-1"
                                                >
                                                    {arrow}
                                                    <SidebarListItem
                                                        interactiveProps={context.interactiveElementProps}
                                                        onToggle={() => {
                                                            if (hasChildren && item.children) {
                                                                const newExpandedIds = new Set(expandedIds);
                                                                if (
                                                                    expandedIds.has(item.index as string)
                                                                ) {
                                                                    newExpandedIds.delete(item.index as string);
                                                                } else {
                                                                    newExpandedIds.add(item.index as string);
                                                                }
                                                                setExpandedIds(newExpandedIds);
                                                            }
                                                        }}
                                                        isExpanded={expandedIds.has(item.index as string)}
                                                        innerRef={() => {}}
                                                        hasChildren={hasChildren || isFolder}
                                                        item={itemData}
                                                        snapshot={{
                                                            isDragging,
                                                        }}
                                                        style={{
                                                            paddingLeft: 0,
                                                        }}
                                                        isRenaming={renamingId === (item.index as string)}
                                                        onRenameComplete={async (newTitle) => {
                                                            if (nodeData) {
                                                                await mutateNote(item.index as string, {
                                                                    title: newTitle,
                                                                });
                                                            }
                                                            setRenamingId(null);
                                                        }}
                                                    />
                                                </div>
                                            </NoteContextMenu>
                                            {children}
                                        </div>
                                    );
                                }}
                            />
                        </ControlledTreeEnvironment>
                    </div>
                </NoteContextMenu>
            </section>

            <CreateNoteModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onCreateNote={handleCreateNote}
                onCreateFolder={handleCreateFolderFromModal}
                onUploadFile={handleUploadFile}
            />
        </>
    );
};

export default SidebarList;
