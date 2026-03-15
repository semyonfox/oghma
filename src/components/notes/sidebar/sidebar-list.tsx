// extracted from Notea (MIT License)
// rewritten for react-arborist v3.4.3 + App Router + Tailwind (no MUI)
import SidebarListItem from './sidebar-list-item';
import NoteContextMenu from './note-context-menu';
import useNoteTreeStore from '@/lib/notes/state/tree';
import useNoteStore from '@/lib/notes/state/note';
import { Tree, TreeApi } from 'react-arborist';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import IconButton from '@/components/icon-button';
import useI18n from '@/lib/notes/hooks/use-i18n';
import { Favorites } from './favorites';
import { makeHierarchy, HierarchicalTreeItemModel } from '@/lib/notes/types/tree';
import type { NodeApi, NodeRendererProps } from 'react-arborist';
import { NOTE_PINNED, NOTE_DELETED, NOTE_SHARED } from '@/lib/notes/types/meta';
import { NoteModel } from '@/lib/notes/types/note';

import CreateNoteModal from '@/components/notes/create-note-modal';

const SidebarList = () => {
    const { t } = useI18n();
    const router = useRouter();
    const { tree, moveItem, mutateItem, initLoaded, collapseAllItems, genNewId, addItem, loadChildren } =
        useNoteTreeStore();
    const { createNote, mutateNote, removeNote } = useNoteStore();
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // ref to react-arborist's TreeApi for imperative open/close/toggle
    const treeApiRef = useRef<TreeApi<HierarchicalTreeItemModel> | undefined>(undefined);

    // convert flat tree structure to hierarchical format for react-arborist
    const treeData = useMemo(() => {
        const hierarchy = makeHierarchy(tree);
        return hierarchy ? hierarchy.children : [];
    }, [tree]);

    // compute initial open state from application tree state
    // react-arborist uses this on mount, then manages open/close internally
    const initialOpenState = useMemo(() => {
        const openMap: Record<string, boolean> = {};
        for (const id in tree.items) {
            if (tree.items[id]?.isExpanded) {
                openMap[id] = true;
            }
        }
        return openMap;
    // only compute once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // notification callback: sync react-arborist's toggle to application state + lazy-load children
    const onToggle = useCallback(
        (id: string) => {
            const item = tree.items[id];
            if (!item) return;

            const isExpanding = !item.isExpanded;
            
            // If expanding and children not yet loaded, lazy-load them
            if (isExpanding && item.children.length === 0 && item.isFolder) {
                loadChildren(id)
                    .catch((e) => console.error(`Error loading children for ${id}:`, e));
            }

            mutateItem(id, {
                isExpanded: isExpanding,
            })
                ?.catch((v) => console.error('Error whilst mutating item: %O', v));
        },
        [mutateItem, loadChildren, tree.items]
    );

    // move handler -- reads tree from store directly to avoid stale closures
    const onMove = useCallback(
        ({ dragIds, parentId, index }: { dragIds: string[], parentId: string | null, index: number }) => {
            if (!parentId || dragIds.length === 0) {
                return;
            }

            const dragId = dragIds[0];

            // read current tree from store (not from closure) to avoid stale data
            const currentItems = useNoteTreeStore.getState().tree.items;

            // find source parent and index
            let sourceParentId = '';
            let sourceIndex = -1;

            for (const itemId in currentItems) {
                const item = currentItems[itemId];
                const idx = item.children.indexOf(dragId);
                if (idx !== -1) {
                    sourceParentId = itemId;
                    sourceIndex = idx;
                    break;
                }
            }

            if (sourceIndex === -1) {
                console.error("Can't find source item");
                return;
            }

            moveItem({
                source: {
                    parentId: sourceParentId,
                    index: sourceIndex,
                },
                destination: {
                    parentId: parentId,
                    index: index,
                },
            }).catch((e) => {
                console.error('Move error', e);
            });
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

    // collapse all: use tree API ref to close all nodes, then sync to application state
    const handleCollapseAll = useCallback(() => {
        treeApiRef.current?.closeAll();
        collapseAllItems();
    }, [collapseAllItems]);

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
            const newNote = await createNote({
                id: newId,
                title: 'Untitled',
                content: '\n',
                pid: parentId,
            });

            if (newNote) {
                // expand parent in react-arborist + application state
                treeApiRef.current?.open(parentId);
                await mutateItem(parentId, {
                    isExpanded: true,
                });
                router.push(`/notes/${newId}`);
            }
        },
        [genNewId, createNote, mutateItem, router]
    );

    const handleCreateFolder = useCallback(
        async (parentId: string) => {
            const newId = genNewId();
            await createNote({
                id: newId,
                title: '\u{1F4C1} New Folder',
                content: '\n',
                pid: parentId,
            });

            // expand parent in react-arborist + application state
            treeApiRef.current?.open(parentId);
            await mutateItem(parentId, {
                isExpanded: true,
            });
        },
        [genNewId, createNote, mutateItem]
    );

    return (
        <>
            <section className="h-full flex text-sm flex-col flex-grow bg-gray-900 overflow-y-auto" aria-label="Notes list">
                {/* Favorites - hidden since we have a separate section now */}
                {/* <Favorites /> */}

                {/* Tree Section Header */}
                <div className="p-2 text-gray-400 flex items-center sticky top-0 bg-gray-900 z-10" role="toolbar" aria-label="Notes actions">
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
                    ></IconButton>
                    <IconButton
                        icon="Plus"
                        onClick={() => setIsModalOpen(true)}
                        className="text-gray-400 hover:text-white transition-colors"
                        title={t('Create page')}
                        aria-label={t('Create page')}
                    ></IconButton>
                </div>
                <div className="flex-grow pb-10">
                    <Tree<HierarchicalTreeItemModel>
                        ref={treeApiRef}
                        data={treeData}
                        openByDefault={false}
                        initialOpenState={initialOpenState}
                        width="100%"
                        indent={10}
                        rowHeight={36}
                        overscanCount={8}
                        onToggle={onToggle}
                        onMove={onMove}
                        disableDrag={false}
                        disableDrop={false}
                        aria-labelledby="my-pages-label"
                    >
                        {({ node, style, dragHandle }: NodeRendererProps<HierarchicalTreeItemModel>) => {
                            const nodeData = node.data;
                            const hasChildren = node.children ? node.children.length > 0 : false;
                            const isPinned = nodeData.data?.pinned === NOTE_PINNED.PINNED;

                            return (
                                <div style={style} ref={dragHandle}>
                                    <NoteContextMenu
                                        noteId={node.id}
                                        isFolder={hasChildren}
                                        isPinned={isPinned}
                                        onRename={handleRename}
                                        onDelete={handleDelete}
                                        onDuplicate={handleDuplicate}
                                        onTogglePin={handleTogglePin}
                                        onCreateNote={handleContextCreateNote}
                                        onCreateFolder={handleCreateFolder}
                                    >
                                        <SidebarListItem
                                            onToggle={() => node.toggle()}
                                            isExpanded={node.isOpen}
                                            innerRef={() => {}}
                                            hasChildren={hasChildren}
                                            item={nodeData.data ?? { id: node.id, title: 'Untitled', deleted: NOTE_DELETED.NORMAL, shared: NOTE_SHARED.PRIVATE, pinned: NOTE_PINNED.UNPINNED, editorsize: null } as NoteModel}
                                            snapshot={{
                                                isDragging: node.state.isDragging,
                                            }}
                                            style={{
                                                paddingLeft: node.level * 10,
                                            }}
                                            isRenaming={renamingId === node.id}
                                            onRenameComplete={async (newTitle) => {
                                                if (nodeData.data) {
                                                    await mutateNote(node.id, { title: newTitle });
                                                }
                                                setRenamingId(null);
                                            }}
                                        />
                                    </NoteContextMenu>
                                </div>
                            );
                        }}
                    </Tree>
                </div>
            </section>

            <CreateNoteModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onCreateNote={handleCreateNote}
                onUploadFile={handleUploadFile}
            />
        </>
    );
};

export default SidebarList;
