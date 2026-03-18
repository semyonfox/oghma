// rewritten for react-complex-tree + App Router + Tailwind
import SidebarListItem from './sidebar-list-item';
import NoteContextMenu from './note-context-menu';
import useNoteTreeStore from '@/lib/notes/state/tree';
import useNoteStore from '@/lib/notes/state/note';
import useLayoutStore from '@/lib/notes/state/layout.zustand';
import useContextMenuStore from '@/lib/notes/state/context-menu';
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
    
    // Debug: confirm component is mounted
    console.debug('[SidebarList] Component mounted, ready for drag/drop debugging');
    const {
        tree,
        moveItem,
        mutateItem,
        initLoaded,
        collapseAllItems,
        genNewId,
        addItem,
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

    // convert flat tree to react-complex-tree format: { [id]: { index, canMove, children, canDropOnFolder } }
    const treeData = useMemo(() => {
        const result: Record<string, any> = {};

        // Add root
        const root = tree.items['root'];
        if (root) {
            result['root'] = {
                index: 'root',
                canMove: false,
                canRename: false,
                children: root.children,
                isFolder: true,
                data: { title: 'Root', isFolder: true },
            };
            console.log('[treeData] root has', root.children?.length || 0, 'direct children');
        }

        // Add all other items
        let folderCount = 0;
        let itemCount = 0;
        for (const id in tree.items) {
            if (id === 'root') continue;
            const item = tree.items[id];
            if (!item) continue;

            itemCount++;
            // Determine if this is a folder based on data or children presence
            const isFolder = item.data?.isFolder === true || item.isFolder === true || (item.children && item.children.length > 0);
            if (isFolder) folderCount++;

            result[id] = {
                index: id,
                canMove: true,
                canRename: true,
                children: item.children || [],
                data: item.data,
                isFolder,
                canDropOn: isFolder, // Only folders can have items dropped on them
            };
        }

        console.log('[treeData] Built tree: root + ' + itemCount + ' items (' + folderCount + ' folders, ' + (itemCount - folderCount) + ' notes)');
        if (folderCount === 0) {
            console.warn('[treeData] WARNING: No folders found! All items are flat at root level.');
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
            console.log('[handleDrop] TRIGGERED! draggedItems:', draggedItems.length, 'target:', target);
            
            if (draggedItems.length === 0) {
                console.log('[handleDrop] ERROR: No dragged items');
                return;
            }

            const currentItems = useNoteTreeStore.getState().tree.items;
            const dragId = draggedItems[0]?.index;
            if (typeof dragId !== 'string') {
                console.debug('[handleDrop] Invalid dragId:', dragId);
                return;
            }

            console.debug('[handleDrop] target:', target);

            // find source parent and its index within that parent
            let sourceParentId = '';
            let sourceIndex = -1;
            for (const itemId in currentItems) {
                const idx = currentItems[itemId].children.indexOf(dragId);
                if (idx !== -1) {
                    sourceParentId = itemId;
                    sourceIndex = idx;
                    break;
                }
            }
            if (sourceIndex === -1) {
                console.error("Can't find source item in tree");
                return;
            }

            let destParentId: string;
            let destIndex: number;

            if (target.targetType === 'item') {
                // dropped directly on a folder — nest inside it at the end
                destParentId = target.targetItem;
                destIndex = currentItems[destParentId]?.children?.length ?? 0;
                console.debug('[handleDrop] Dropping ON item:', destParentId);
            } else if (target.targetType === 'between-items') {
                // dropped between items — use the parent and the child insertion index
                destParentId = target.parentItem;
                destIndex = target.childIndex ?? 0;
                console.debug('[handleDrop] Dropping BETWEEN items in parent:', destParentId, 'at index:', destIndex);
            } else {
                // dropped on root
                destParentId = 'root';
                destIndex = currentItems['root']?.children?.length ?? 0;
                console.debug('[handleDrop] Dropping on ROOT at index:', destIndex);
            }

            if (typeof destParentId !== 'string') {
                console.error('Invalid destParentId:', destParentId);
                return;
            }

            console.debug('[handleDrop] Moving from', sourceParentId, 'index', sourceIndex, 'to', destParentId, 'index', destIndex);

            moveItem({
                source: { parentId: sourceParentId, index: sourceIndex },
                destination: { parentId: destParentId, index: destIndex },
            }).catch((e) => console.error('Move error', e));
        },
        [moveItem]
    );

    const handleCreateNote = useCallback(
        async (title: string, language: string) => {
            const newId = genNewId();
            const newNote = await createNote({
                id: newId,
                title: title,
                content: '\n',
                pid: undefined,
            });

            if (newNote) {
                router.push(`/notes/${newId}`);
            }
        },
        [genNewId, createNote, router]
    );

    const handleCreateFolderFromModal = useCallback(
        async () => {
            const newFolder = await createFolder(undefined);
            // Don't navigate - let them create more items in the folder
        },
        [createFolder]
    );

    const handleUploadFile = useCallback(async (file: File) => {
        // create a note entry for the uploaded file
        const newId = genNewId();
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
        formData.append('noteId', newId);

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
            id: newId,
            title: fileName,
            content,
        });

        if (newNote) {
            router.push(`/notes/${newId}`);
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

            const newId = genNewId();
            const newNote = await createNote({
                id: newId,
                title: `${original.data.title} (Copy)`,
                content: original.data.content || '\n',
                pid: original.data.pid,
            });

            if (newNote) {
                router.push(`/notes/${newId}`);
            }
        },
        [tree.items, genNewId, createNote, router]
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
            const newId = genNewId();
            // If creating at root level, don't specify pid
            const pid = parentId === 'root' ? undefined : parentId;
            const newNote = await createNote({
                id: newId,
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
                router.push(`/notes/${newId}`);
            }
        },
        [genNewId, createNote, mutateItem, router, expandedIds, setExpandedIds]
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

    // handle right-click context menu
    const handleItemContextMenu = useCallback((e: React.MouseEvent, itemId: string, isFolder: boolean, isPinned: boolean) => {
        e.preventDefault();
        
        // Get viewport dimensions
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Exact menu dimensions
        const menuWidth = 192; // w-48
        const menuHeight = 320;
        const padding = 8;
        
        let x = e.clientX;
        let y = e.clientY;
        
        // Adjust if menu would overflow right
        if (x + menuWidth > viewportWidth - padding) {
            x = Math.max(padding, x - menuWidth);
        }
        
        // Adjust if menu would overflow bottom
        if (y + menuHeight > viewportHeight - padding) {
            y = Math.max(padding, y - menuHeight - 4);
        }
        
        // Update context menu store to show menu at this position
        useContextMenuStore.getState().setOpenMenu(itemId, x, y, isFolder, isPinned);
    }, []);

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
                                  
                                  // Log once for root and first few items to see context keys
                                  if (item.index === 'root' || depth === 0) {
                                    const contextKeys = Object.keys(context || {});
                                    console.log('[renderItem]', String(item.index).slice(0, 8), 'depth:', depth, 'isDragging:', isDragging, 'hasChildren:', hasChildren, 'contextKeys:', contextKeys.length);
                                    if (contextKeys.length === 0) {
                                      console.warn('[renderItem] WARNING: context is empty! No drag handlers available');
                                    }
                                  }

                                  return (
                                      <div className="flex flex-col w-full">
                                          {/* Wrapper div with context props FROM REACT-COMPLEX-TREE - these contain the drag handlers */}
                                           <div
                                               {...context.itemContainerWithoutChildrenProps}
                                               className="flex items-center gap-1 px-2 py-1 rounded hover:bg-white/5 transition-colors w-full"
                                               onContextMenu={(e) => handleItemContextMenu(e, item.index as string, isFolder, isPinned)}
                                           >
                                               {/* Content without context menu wrapper - allows drag/drop to work */}
                                               <div className="flex items-center gap-1 flex-1 min-w-0">
                                                   {arrow}
                                                   <SidebarListItem
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
                                                       hasChildren={hasChildren}
                                                       item={
                                                           nodeData ?? ({
                                                               id: item.index,
                                                               title: 'Untitled',
                                                               deleted: NOTE_DELETED.NORMAL,
                                                               shared: NOTE_SHARED.PRIVATE,
                                                               pinned: NOTE_PINNED.UNPINNED,
                                                               editorsize: null,
                                                           } as NoteModel)
                                                       }
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
                                           </div>
                                          {/* Nested children - automatically handled by react-complex-tree */}
                                          {children}
                                     </div>
                                 );
                             }}
                        />
                    </ControlledTreeEnvironment>
                </div>
            </section>

            <CreateNoteModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onCreateNote={handleCreateNote}
                onCreateFolder={handleCreateFolderFromModal}
                onUploadFile={handleUploadFile}
            />

            <NoteContextMenu
                onRename={handleRename}
                onDelete={handleDelete}
                onDuplicate={handleDuplicate}
                onTogglePin={handleTogglePin}
                onCreateNote={handleContextCreateNote}
                onCreateFolder={handleCreateFolder}
                onOpenInSplit={handleOpenInSplit}
            />
        </>
    );
};

export default SidebarList;
