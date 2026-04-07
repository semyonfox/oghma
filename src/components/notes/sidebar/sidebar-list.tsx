// obsidian-style file tree using react-complex-tree for drag-and-drop
import NoteContextMenu from "./note-context-menu";
import TreeItem from "./tree-item";
import useNoteTreeStore from "@/lib/notes/state/tree";
import useLayoutStore from "@/lib/notes/state/layout.zustand";
import useContextMenuStore from "@/lib/notes/state/context-menu";
import { buildFileSpec } from "@/lib/notes/utils/file-spec";
import React, { memo, useMemo, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
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
import { useTreeData } from "./use-tree-data";
import { useSidebarActions } from "./use-sidebar-actions";

const SidebarList = () => {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();

  const { loadingChildren, selectedIds, setSelectedIds, focusedId, setFocusedId, refreshTree } =
    useNoteTreeStore();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshTree = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshTree();
    } catch (error) {
      console.error("Failed to refresh filetree:", error);
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshTree]);

  const treeData = useTreeData();

  const {
    tree,
    initLoaded,
    expandedIds,
    setExpandedIds,
    loadChildren,
    mutateNote,
    handleExpandItem,
    handleCollapseItem,
    onMissingItems,
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
  } = useSidebarActions({ setRenamingId, setDeleteConfirmId, deleteConfirmId });

  // active note from URL
  const activeId = useMemo(() => {
    if (!pathname || pathname === "/") return null;
    const segs = pathname.split("/").filter(Boolean);
    return segs[0] === "notes" ? (segs[1] ?? null) : (segs[0] ?? null);
  }, [pathname]);

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
              onClick={handleRefreshTree}
              disabled={isRefreshing}
              className={`p-0.5 rounded hover:bg-subtle text-text-tertiary hover:text-text-secondary transition-colors ${
                isRefreshing ? "opacity-50 cursor-not-allowed" : ""
              }`}
              title={t("Refresh filetree")}
            >
              <svg
                className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`}
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M4 10a6 6 0 1010.5-5.5M10 3V1m0 2V1" />
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
