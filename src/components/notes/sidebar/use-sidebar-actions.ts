import React, { useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import useNoteTreeStore from "@/lib/notes/state/tree";
import useNoteStore from "@/lib/notes/state/note";
import useLayoutStore from "@/lib/notes/state/layout.zustand";
import useContextMenuStore from "@/lib/notes/state/context-menu";
import { buildFileSpec } from "@/lib/notes/utils/file-spec";
import { NOTE_PINNED } from "@/lib/notes/types/meta";
import { NoteModel } from "@/lib/notes/types/note";
import { getTopLevelSelectedIds, treeItemContainsId } from "./selection-utils";
import useI18n from "@/lib/notes/hooks/use-i18n";

export type DeleteConfirmTarget =
  | { mode: "single"; ids: [string] }
  | { mode: "bulk"; ids: string[] }
  | null;

// sidebar CRUD operations and action callbacks
export function useSidebarActions(deps: {
  setRenamingId: (id: string | null) => void;
  setDeleteConfirmTarget: (target: DeleteConfirmTarget) => void;
  deleteConfirmTarget: DeleteConfirmTarget;
  activeId: string | null;
  setSelectionAnchorId: (id: string | null) => void;
  onDeleteSelectionCleared: () => void;
}) {
  const {
    setRenamingId,
    setDeleteConfirmTarget,
    deleteConfirmTarget,
    activeId,
    setSelectionAnchorId,
    onDeleteSelectionCleared,
  } = deps;
  const router = useRouter();
  const { t } = useI18n();

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
    refreshTree,
  } = useNoteTreeStore();
  const { createNote, createFolder, mutateNote, removeNote } = useNoteStore();

  // create note from modal with title and language
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

  // create folder from modal
  const handleCreateFolderFromModal = useCallback(async () => {
    await createFolder(undefined);
  }, [createFolder]);

  // quick new note from toolbar button
  const handleQuickNewNote = useCallback(async () => {
    const newId = genNewId();
    const newNote = await createNote({
      id: newId,
      title: t("Untitled"),
      content: "\n",
      pid: undefined,
    });
    if (newNote) {
      setRenamingId(newId);
      router.push(`/notes/${newId}`);
    }
  }, [genNewId, createNote, router, setRenamingId, t]);

  // quick new folder from toolbar button
  const handleQuickNewFolder = useCallback(async () => {
    const newFolder = await createFolder(undefined);
    if (newFolder) {
      const folderId = typeof newFolder === "string" ? newFolder : newFolder.id;
      if (folderId) setRenamingId(folderId);
    }
  }, [createFolder, setRenamingId]);

  // upload one file and create a note for it
  const uploadFile = useCallback(
    async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        throw new Error("upload failed");
      }

      return uploadRes.json();
    },
    [],
  );

  // upload files
  const handleUploadFiles = useCallback(
    async (files: File[]) => {
      let firstNoteId: string | null = null;

      for (const file of files) {
        try {
          const uploadData = await uploadFile(file);
          if (!firstNoteId) firstNoteId = uploadData.noteId;
        } catch {
          toast.error(t("Failed to upload {filename}", { filename: file.name }));
        }
      }

      if (firstNoteId) {
        router.push(`/notes/${firstNoteId}`);
      }
    },
    [router, uploadFile, t],
  );

  // collapse all tree items
  const handleCollapseAll = useCallback(() => {
    setExpandedIds(new Set());
    collapseAllItems();
  }, [collapseAllItems, setExpandedIds]);

  // start renaming an item
  const handleRename = useCallback(
    (id: string) => {
      setRenamingId(id);
    },
    [setRenamingId],
  );

  // request delete (shows confirmation)
  const handleDeleteRequest = useCallback(
    (id: string) => {
      if (!initLoaded) {
        toast.error(t("Please wait for notes to load"));
        return;
      }
      setDeleteConfirmTarget({ mode: "single", ids: [id] });
    },
    [initLoaded, setDeleteConfirmTarget, t],
  );

  const handleBulkDeleteRequest = useCallback(
    (ids: string[]) => {
      if (!initLoaded) {
        toast.error(t("Please wait for notes to load"));
        return;
      }
      const cleanIds = ids.filter((id) => id !== "root" && tree.items[id]);
      if (cleanIds.length === 0) return;
      if (cleanIds.length === 1) {
        setDeleteConfirmTarget({ mode: "single", ids: [cleanIds[0]] });
        return;
      }
      setDeleteConfirmTarget({ mode: "bulk", ids: cleanIds });
    },
    [initLoaded, setDeleteConfirmTarget, tree.items, t],
  );

  // confirm and execute delete
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirmTarget) return;

    const target = deleteConfirmTarget;
    setDeleteConfirmTarget(null);

    if (target.mode === "single") {
      const id = target.ids[0];
      try {
        await removeNote(id);
        const nextSelected = new Set(useNoteTreeStore.getState().selectedIds);
        nextSelected.delete(id);
        setSelectedIds(nextSelected);
        onDeleteSelectionCleared();
        if (activeId === id) router.push("/notes");
      } catch {
        toast.error(t("Failed to delete"));
      }
      return;
    }

    const idsToDelete = getTopLevelSelectedIds(target.ids, tree);
    let deletedCount = 0;
    let failedCount = 0;
    const deletedIds = new Set<string>();

    for (const id of idsToDelete) {
      try {
        await removeNote(id);
        deletedCount += 1;
        deletedIds.add(id);
      } catch {
        failedCount += 1;
      }
    }

    if (failedCount === 0) {
      setSelectedIds(new Set());
      onDeleteSelectionCleared();
      if (
        activeId &&
        idsToDelete.some(
          (id) => id === activeId || treeItemContainsId(tree, id, activeId),
        )
      ) {
        router.push("/notes");
      }
      return;
    }

    if (deletedCount > 0) {
      toast.error(
        t("Deleted {deletedCount} items. Failed to delete {failedCount} items.", {
          deletedCount,
          failedCount,
        }),
      );
      const remainingSelection = new Set(
        target.ids.filter(
          (id) =>
            !Array.from(deletedIds).some(
              (deletedId) =>
                deletedId === id || treeItemContainsId(tree, deletedId, id),
            ),
        ),
      );
      setSelectedIds(remainingSelection);
      await refreshTree();
      return;
    }

    toast.error(t("Failed to delete selected items."));
    setSelectedIds(new Set(target.ids));
    await refreshTree();
  }, [
    activeId,
    deleteConfirmTarget,
    onDeleteSelectionCleared,
    refreshTree,
    removeNote,
    router,
    setDeleteConfirmTarget,
    setSelectedIds,
    t,
    tree,
  ]);

  // duplicate a note
  const handleDuplicate = useCallback(
    async (id: string) => {
      try {
        const original = tree.items[id];
        if (!original?.data) return;
        const newId = genNewId();
        const newNote = await createNote({
          id: newId,
          title: t("{title} (Copy)", { title: original.data.title }),
          content: original.data.content || "\n",
          pid: original.data.pid,
        });
        if (newNote) router.push(`/notes/${newId}`);
      } catch {
        toast.error(t("Failed to duplicate"));
      }
    },
    [tree.items, genNewId, createNote, router, t],
  );

  // toggle pin/unpin
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

  // create note inside a folder (from context menu)
  const handleContextCreateNote = useCallback(
    async (parentId: string) => {
      const newId = genNewId();
      const pid = parentId === "root" ? undefined : parentId;
      const newNote = await createNote({
        id: newId,
        title: t("Untitled"),
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
    [
      genNewId,
      createNote,
      mutateItem,
      router,
      expandedIds,
      setExpandedIds,
      setRenamingId,
      t,
    ],
  );

  // create folder inside a folder (from context menu)
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

  // open in split pane
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

  // navigate to AI chat with note/folder context
  const handleOpenInAIChat = useCallback(
    (id: string, nodeData: NoteModel | undefined, isFolder: boolean) => {
      const title = encodeURIComponent(
        nodeData?.title || (isFolder ? t("Folder") : t("Untitled")),
      );
      const param = isFolder
        ? `folderId=${id}&folderTitle=${title}`
        : `noteId=${id}&noteTitle=${title}`;
      router.push(`/chat?${param}`);
    },
    [router, t],
  );

  // open context menu on right-click
  const handleItemContextMenu = useCallback(
    (
      e: React.MouseEvent,
      itemId: string,
      isFolder: boolean,
      isPinned: boolean,
    ) => {
      e.preventDefault();
      const selectedGroup =
        selectedIds.has(itemId) && selectedIds.size > 1
          ? Array.from(selectedIds).filter((id) => id !== "root")
          : [itemId];

      if (selectedGroup.length === 1) {
        setSelectedIds(new Set([itemId]));
        setSelectionAnchorId(itemId);
      }

      useContextMenuStore
        .getState()
        .setOpenMenu(
          itemId,
          e.clientX,
          e.clientY,
          isFolder,
          isPinned,
          selectedGroup,
        );
    },
    [selectedIds, setSelectedIds, setSelectionAnchorId],
  );

  // drag and drop handler
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

  return {
    // tree store state/methods passed through
    tree,
    initLoaded,
    expandedIds,
    setExpandedIds,
    loadChildren,
    mutateItem,
    mutateNote,
    // view state helpers
    handleExpandItem: useCallback(
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
    ),
    handleCollapseItem: useCallback(
      (item: any) => {
        const itemId = item.index;
        if (typeof itemId === "string") {
          mutateItem(itemId, { isExpanded: false });
        }
      },
      [mutateItem],
    ),
    onMissingItems: useCallback(
      async (itemIds: import("react-complex-tree").TreeItemIndex[]) => {
        for (const itemId of itemIds) {
          if (typeof itemId === "string") {
            const item = useNoteTreeStore.getState().tree.items[itemId];
            if (item && item.isFolder && item.children.length === 0) {
              await loadChildren(itemId);
            }
          }
        }
      },
      [loadChildren],
    ),
    // CRUD actions
    handleCreateNote,
    handleCreateFolderFromModal,
    handleQuickNewNote,
    handleQuickNewFolder,
    handleUploadFiles,
    handleCollapseAll,
    handleRename,
    handleDeleteRequest,
    handleBulkDeleteRequest,
    handleDeleteConfirm,
    handleDuplicate,
    handleTogglePin,
    handleContextCreateNote,
    handleCreateFolder,
    handleOpenInSplit,
    handleOpenInAIChat,
    handleItemContextMenu,
    handleDrop,
  };
}
