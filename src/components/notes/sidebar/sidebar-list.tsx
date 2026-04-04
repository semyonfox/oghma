// obsidian-style file tree using react-complex-tree for drag-and-drop
import NoteContextMenu from "./note-context-menu";
import TreeItem from "./tree-item";
import useNoteTreeStore from "@/lib/notes/state/tree";
import useNoteStore from "@/lib/notes/state/note";
import useLayoutStore from "@/lib/notes/state/layout.zustand";
import useContextMenuStore from "@/lib/notes/state/context-menu";
import { buildFileSpec } from "@/lib/notes/utils/file-spec";
import React, { memo, useCallback, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { Favorites } from "./favorites";
import {
  ControlledTreeEnvironment,
  Tree,
  TreeItemIndex,
} from "react-complex-tree";
import "react-complex-tree/lib/style.css";
import { NOTE_PINNED } from "@/lib/notes/types/meta";
import { NoteModel } from "@/lib/notes/types/note";
import CreateNoteModal from "@/components/notes/create-note-modal";

const SidebarList = () => {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();

  const {
    tree,
    moveItem,
    mutateItem,
    initLoaded,
    collapseAllItems,
    genNewId,
    addItem: _addItem,
    loadChildren,
    loadingChildren,
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
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // active note from URL
  const activeId = useMemo(() => {
    if (!pathname || pathname === "/") return null;
    const segs = pathname.split("/").filter(Boolean);
    return segs[0] === "notes" ? (segs[1] ?? null) : (segs[0] ?? null);
  }, [pathname]);

  // convert flat tree to react-complex-tree format
  const treeData = useMemo(() => {
    const result: Record<string, any> = {};

    // deduplicate children arrays to prevent React key collisions
    const dedup = (arr: string[]) => [...new Set(arr)];

    const root = tree.items["root"];
    if (root) {
      result["root"] = {
        index: "root",
        canMove: false,
        canRename: false,
        children: dedup(root.children),
        isFolder: true,
        data: { title: "Root", isFolder: true },
      };
    }

    for (const id in tree.items) {
      if (id === "root") continue;
      const item = tree.items[id];
      if (!item) continue;

      const isFolder =
        item.data?.isFolder === true ||
        item.isFolder === true ||
        (item.children && item.children.length > 0);

      result[id] = {
        index: id,
        canMove: true,
        canRename: false,
        children: dedup(item.children || []),
        data: item.data,
        isFolder,
        canDropOn: isFolder,
      };
    }

    return result;
  }, [tree]);

  // lazy-load children
  const onMissingItems = useCallback(
    async (itemIds: TreeItemIndex[]) => {
      for (const itemId of itemIds) {
        if (typeof itemId === "string") {
          const item = tree.items[itemId];
          if (item && item.isFolder && item.children.length === 0) {
            await loadChildren(itemId);
          }
        }
      }
    },
    [tree.items, loadChildren],
  );

  const handleExpandItem = useCallback(
    (item: any) => {
      const itemId = item.index;
      if (typeof itemId === "string") {
        mutateItem(itemId, { isExpanded: true });
        const treeItem = useNoteTreeStore.getState().tree.items[itemId];
        if (treeItem?.isFolder && !treeItem.childrenLoaded) {
          loadChildren(itemId);
        }
      }
    },
    [mutateItem, loadChildren],
  );

  const handleCollapseItem = useCallback(
    (item: any) => {
      const itemId = item.index;
      if (typeof itemId === "string") {
        mutateItem(itemId, { isExpanded: false });
      }
    },
    [mutateItem],
  );

  // drag and drop
  const handleDrop = useCallback(
    (draggedItems: any[], target: any) => {
      if (draggedItems.length === 0) return;

      const currentItems = useNoteTreeStore.getState().tree.items;
      const dragId = draggedItems[0]?.index;
      if (typeof dragId !== "string") return;

      let sourceParentId = "";
      let sourceIndex = -1;
      for (const itemId in currentItems) {
        const idx = currentItems[itemId].children.indexOf(dragId);
        if (idx !== -1) {
          sourceParentId = itemId;
          sourceIndex = idx;
          break;
        }
      }
      if (sourceIndex === -1) return;

      let destParentId: string;
      let destIndex: number;

      if (target.targetType === "item") {
        destParentId = target.targetItem;
        destIndex = currentItems[destParentId]?.children?.length ?? 0;
      } else if (target.targetType === "between-items") {
        destParentId = target.parentItem;
        destIndex = target.childIndex ?? 0;
      } else {
        destParentId = "root";
        destIndex = currentItems["root"]?.children?.length ?? 0;
      }

      if (typeof destParentId !== "string") return;

      moveItem({
        source: { parentId: sourceParentId, index: sourceIndex },
        destination: { parentId: destParentId, index: destIndex },
      });
    },
    [moveItem],
  );

  // create actions
  const handleCreateNote = useCallback(
    async (title: string, _language: string) => {
      const newId = genNewId();
      const newNote = await createNote({
        id: newId,
        title: title,
        content: "\n",
        pid: undefined,
      });
      if (newNote) router.push(`/notes/${newId}`);
    },
    [genNewId, createNote, router],
  );

  const handleCreateFolderFromModal = useCallback(async () => {
    await createFolder(undefined);
  }, [createFolder]);

  const handleQuickNewNote = useCallback(async () => {
    const newId = genNewId();
    const newNote = await createNote({
      id: newId,
      title: "Untitled",
      content: "\n",
      pid: undefined,
    });
    if (newNote) {
      setRenamingId(newId);
      router.push(`/notes/${newId}`);
    }
  }, [genNewId, createNote, router]);

  const handleQuickNewFolder = useCallback(async () => {
    const newFolder = await createFolder(undefined);
    if (newFolder) {
      const folderId = typeof newFolder === "string" ? newFolder : newFolder.id;
      if (folderId) setRenamingId(folderId);
    }
  }, [createFolder]);

  const handleUploadFile = useCallback(
    async (file: File) => {
      try {
        const formData = new FormData();
        formData.append("file", file);

        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) {
          toast.error("Failed to upload file");
          return;
        }

        const uploadData = await uploadRes.json();
        router.push(`/notes/${uploadData.noteId}`);
      } catch {
        toast.error("Failed to upload file");
      }
    },
    [router],
  );

  const handleCollapseAll = useCallback(() => {
    setExpandedIds(new Set());
    collapseAllItems();
  }, [collapseAllItems, setExpandedIds]);

  // context menu handlers
  const handleRename = useCallback((id: string) => {
    setRenamingId(id);
  }, []);

  const handleDeleteRequest = useCallback(
    (id: string) => {
      if (!initLoaded) {
        toast.error("Please wait for notes to load");
        return;
      }
      setDeleteConfirmId(id);
    },
    [initLoaded],
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirmId) return;
    const id = deleteConfirmId;
    setDeleteConfirmId(null);
    try {
      await removeNote(id);
    } catch {
      toast.error("Failed to delete");
    }
  }, [deleteConfirmId, removeNote]);

  const handleDuplicate = useCallback(
    async (id: string) => {
      try {
        const original = tree.items[id];
        if (!original?.data) return;
        const newId = genNewId();
        const newNote = await createNote({
          id: newId,
          title: `${original.data.title} (Copy)`,
          content: original.data.content || "\n",
          pid: original.data.pid,
        });
        if (newNote) router.push(`/notes/${newId}`);
      } catch {
        toast.error("Failed to duplicate");
      }
    },
    [tree.items, genNewId, createNote, router],
  );

  const handleTogglePin = useCallback(
    async (id: string) => {
      const item = tree.items[id];
      if (!item?.data) return;
      const newPinned =
        item.data.pinned === NOTE_PINNED.PINNED
          ? NOTE_PINNED.UNPINNED
          : NOTE_PINNED.PINNED;
      await mutateNote(id, { pinned: newPinned });
    },
    [tree.items, mutateNote],
  );

  const handleContextCreateNote = useCallback(
    async (parentId: string) => {
      const newId = genNewId();
      const pid = parentId === "root" ? undefined : parentId;
      const newNote = await createNote({
        id: newId,
        title: "Untitled",
        content: "\n",
        pid,
      });
      if (newNote) {
        if (parentId !== "root") {
          const newExpandedIds = new Set(expandedIds);
          newExpandedIds.add(parentId);
          setExpandedIds(newExpandedIds);
          await mutateItem(parentId, { isExpanded: true });
        }
        setRenamingId(newId);
        router.push(`/notes/${newId}`);
      }
    },
    [genNewId, createNote, mutateItem, router, expandedIds, setExpandedIds],
  );

  const handleCreateFolder = useCallback(
    async (parentId: string) => {
      const pid = parentId === "root" ? undefined : parentId;
      const newFolder = await createFolder(pid);
      if (newFolder) {
        if (parentId !== "root") {
          const newExpandedIds = new Set(expandedIds);
          newExpandedIds.add(parentId);
          setExpandedIds(newExpandedIds);
          await mutateItem(parentId, { isExpanded: true });
        }
      }
    },
    [createFolder, mutateItem, expandedIds, setExpandedIds],
  );

  const handleOpenInSplit = useCallback(
    (id: string) => {
      const item = tree.items[id];
      if (!item?.data) return;
      const { setPaneB, setActivePane } = useLayoutStore.getState();
      setPaneB(buildFileSpec(item.data));
      setActivePane("B");
    },
    [tree.items],
  );

  const handleOpenInAIChat = useCallback(
    (id: string, nodeData: NoteModel | undefined, isFolder: boolean) => {
      const title = encodeURIComponent(
        nodeData?.title || (isFolder ? "Folder" : "Untitled"),
      );
      const param = isFolder
        ? `folderId=${id}&folderTitle=${title}`
        : `noteId=${id}&noteTitle=${title}`;
      router.push(`/chat?${param}`);
    },
    [router],
  );

  const handleItemContextMenu = useCallback(
    (
      e: React.MouseEvent,
      itemId: string,
      isFolder: boolean,
      isPinned: boolean,
    ) => {
      e.preventDefault();
      useContextMenuStore
        .getState()
        .setOpenMenu(itemId, e.clientX, e.clientY, isFolder, isPinned);
    },
    [],
  );

  // view state for react-complex-tree
  const viewState = useMemo(
    () => ({
      "notes-tree": {
        expandedItems: Array.from(expandedIds) as TreeItemIndex[],
        selectedItems: Array.from(selectedIds) as TreeItemIndex[],
        focusedItem: focusedId as TreeItemIndex | undefined,
      },
    }),
    [expandedIds, selectedIds, focusedId],
  );

  return (
    <>
      <section
        className="h-full flex flex-col text-[13px] bg-background"
        aria-label={t("Notes list")}
      >
        {/* Favorites */}
        <Favorites />

        {/* Section header - obsidian style */}
        <div
          className="flex items-center h-7 px-2 mt-1 group"
          role="toolbar"
          aria-label={t("Notes actions")}
        >
          <span className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary select-none">
            {t("Notes")}
          </span>
          {!initLoaded && (
            <svg
              className="animate-spin h-3 w-3 text-text-tertiary mr-1"
              viewBox="0 0 24 24"
              fill="none"
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
          {/* action buttons - always visible */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={handleQuickNewNote}
              className="p-0.5 rounded hover:bg-subtle text-text-tertiary hover:text-text-secondary transition-colors"
              title={t("New note")}
            >
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M4 4h8l4 4v8a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z" />
                <path d="M12 4v4h4" />
              </svg>
            </button>
            <button
              onClick={handleQuickNewFolder}
              className="p-0.5 rounded hover:bg-subtle text-text-tertiary hover:text-text-secondary transition-colors"
              title={t("New folder")}
            >
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M3 5a1 1 0 011-1h4l2 2h6a1 1 0 011 1v8a1 1 0 01-1 1H4a1 1 0 01-1-1V5z" />
                <path d="M10 9v4M8 11h4" />
              </svg>
            </button>
            <button
              onClick={handleCollapseAll}
              className="p-0.5 rounded hover:bg-subtle text-text-tertiary hover:text-text-secondary transition-colors"
              title={t("Collapse all")}
            >
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M4 8l6-4 6 4M4 12l6 4 6-4" />
              </svg>
            </button>
            <button
              onClick={() => setIsModalOpen(true)}
              className="p-0.5 rounded hover:bg-subtle text-text-tertiary hover:text-text-secondary transition-colors"
              title={t("More options")}
            >
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tree */}
        <div className="flex-1 pb-4">
          <ControlledTreeEnvironment
            items={treeData}
            getItemTitle={(item) => item.data?.title ?? "Untitled"}
            viewState={viewState}
            onExpandItem={handleExpandItem}
            onCollapseItem={handleCollapseItem}
            onSelectItems={(items) =>
              setSelectedIds(new Set(items as string[]))
            }
            onFocusItem={(item) => setFocusedId(item?.index as string | null)}
            onDrop={handleDrop}
            onMissingItems={onMissingItems}
            onStartRenamingItem={() => {}}
            canDragAndDrop
            canReorderItems
            canDropOnFolder
          >
            <Tree
              treeId="notes-tree"
              rootItem="root"
              treeLabel={t("Notes")}
              renderItem={({ item, depth, children, context }) => {
                const nodeData = item.data as NoteModel | undefined;
                const hasChildren = !!(
                  item.children && item.children.length > 0
                );
                const isFolder =
                  item.isFolder || nodeData?.isFolder || hasChildren;
                const _isPinned = nodeData?.pinned === NOTE_PINNED.PINNED;
                const isDragging = (context as any)?.isDragging === true;
                const isExpanded = expandedIds.has(item.index as string);
                const isActive = activeId === item.index;
                const isItemRenaming = renamingId === item.index;
                const itemId = item.index as string;

                return (
                  <TreeItem
                    key={itemId}
                    itemId={itemId}
                    nodeData={nodeData}
                    isFolder={!!isFolder}
                    isExpanded={isExpanded}
                    isActive={!!isActive}
                    isDragging={isDragging}
                    isLoading={loadingChildren.has(itemId)}
                    hasChildren={hasChildren}
                    depth={depth}
                    isRenaming={isItemRenaming}
                    context={context}
                    onContextMenu={(e) =>
                      handleItemContextMenu(e, itemId, !!isFolder, _isPinned)
                    }
                    onToggle={() => {
                      if (isFolder) {
                        const next = new Set(expandedIds);
                        if (isExpanded) {
                          next.delete(itemId);
                        } else {
                          next.add(itemId);
                          const ti =
                            useNoteTreeStore.getState().tree.items[itemId];
                          if (ti && !ti.childrenLoaded) loadChildren(itemId);
                        }
                        setExpandedIds(next);
                      }
                    }}
                    onClick={() => {
                      if (isFolder) {
                        const next = new Set(expandedIds);
                        if (isExpanded) {
                          next.delete(itemId);
                        } else {
                          next.add(itemId);
                          const ti =
                            useNoteTreeStore.getState().tree.items[itemId];
                          if (ti && !ti.childrenLoaded) loadChildren(itemId);
                        }
                        setExpandedIds(next);
                      } else if (nodeData) {
                        const { setPaneA, setActivePane } =
                          useLayoutStore.getState();
                        setPaneA(buildFileSpec(nodeData));
                        setActivePane("A");
                        const href = pathname?.startsWith("/notes")
                          ? `/notes/${itemId}`
                          : `/${itemId}`;
                        router.push(href);
                      }
                    }}
                    onRenameComplete={async (newTitle) => {
                      if (nodeData) {
                        await mutateNote(itemId, { title: newTitle });
                      }
                      setRenamingId(null);
                    }}
                    onAddNote={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      await handleContextCreateNote(itemId);
                    }}
                    onDotsClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const rect = (
                        e.currentTarget as HTMLElement
                      ).getBoundingClientRect();
                      useContextMenuStore
                        .getState()
                        .setOpenMenu(
                          itemId,
                          rect.left,
                          rect.bottom + 4,
                          !!isFolder,
                          _isPinned,
                        );
                    }}
                    onOpenInAIChat={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleOpenInAIChat(itemId, nodeData, !!isFolder);
                    }}
                    initLoaded={initLoaded}
                  >
                    {children}
                  </TreeItem>
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
        onDelete={handleDeleteRequest}
        onDuplicate={handleDuplicate}
        onTogglePin={handleTogglePin}
        onCreateNote={handleContextCreateNote}
        onCreateFolder={handleCreateFolder}
        onOpenInSplit={handleOpenInSplit}
      />

      {/* delete confirmation overlay */}
      {deleteConfirmId && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50"
          onClick={() => setDeleteConfirmId(null)}
        >
          <div
            className="bg-surface rounded-lg shadow-2xl ring-1 ring-border-subtle p-5 w-[320px] space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-text-secondary">
              {t("Delete")}{" "}
              <span className="font-medium text-text">
                {tree.items[deleteConfirmId]?.data?.title || t("Untitled")}
              </span>
              ?
              {(tree.items[deleteConfirmId]?.children?.length ?? 0) > 0 && (
                <span className="block mt-1 text-text-tertiary text-xs">
                  {t("This folder and all its contents will be deleted.")}
                </span>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-3 py-1.5 text-xs font-medium rounded text-text-secondary hover:bg-white/[0.06] transition-colors"
              >
                {t("Cancel")}
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-3 py-1.5 text-xs font-medium rounded bg-error-500/20 text-error-400 hover:bg-error-500/30 transition-colors"
              >
                {t("Delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default memo(SidebarList);
