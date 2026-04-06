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

// sidebar CRUD operations and action callbacks
export function useSidebarActions(deps: {
  setRenamingId: (id: string | null) => void;
  setDeleteConfirmId: (id: string | null) => void;
  deleteConfirmId: string | null;
}) {
  const { setRenamingId, setDeleteConfirmId, deleteConfirmId } = deps;
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
      title: "Untitled",
      content: "\n",
      pid: undefined,
    });
    if (newNote) {
      setRenamingId(newId);
      router.push(`/notes/${newId}`);
    }
  }, [genNewId, createNote, router, setRenamingId]);

  // quick new folder from toolbar button
  const handleQuickNewFolder = useCallback(async () => {
    const newFolder = await createFolder(undefined);
    if (newFolder) {
      const folderId = typeof newFolder === "string" ? newFolder : newFolder.id;
      if (folderId) setRenamingId(folderId);
    }
  }, [createFolder, setRenamingId]);

  // upload file
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
        toast.error("Please wait for notes to load");
        return;
      }
      setDeleteConfirmId(id);
    },
    [initLoaded, setDeleteConfirmId],
  );

  // confirm and execute delete
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirmId) return;
    const id = deleteConfirmId;
    setDeleteConfirmId(null);
    try {
      await removeNote(id);
    } catch {
      toast.error("Failed to delete");
    }
  }, [deleteConfirmId, removeNote, setDeleteConfirmId]);

  // duplicate a note
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
    [
      genNewId,
      createNote,
      mutateItem,
      router,
      expandedIds,
      setExpandedIds,
      setRenamingId,
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
        nodeData?.title || (isFolder ? "Folder" : "Untitled"),
      );
      const param = isFolder
        ? `folderId=${id}&folderTitle=${title}`
        : `noteId=${id}&noteTitle=${title}`;
      router.push(`/chat?${param}`);
    },
    [router],
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
      useContextMenuStore
        .getState()
        .setOpenMenu(itemId, e.clientX, e.clientY, isFolder, isPinned);
    },
    [],
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
    handleUploadFile,
    handleCollapseAll,
    handleRename,
    handleDeleteRequest,
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
