// obsidian-style file tree using react-complex-tree for drag-and-drop
import NoteContextMenu from "./note-context-menu";
import TreeItem from "./tree-item";
import useNoteTreeStore from "@/lib/notes/state/tree";
import useLayoutStore from "@/lib/notes/state/layout.zustand";
import useContextMenuStore from "@/lib/notes/state/context-menu";
import { buildFileSpec } from "@/lib/notes/utils/file-spec";
import React, { memo, useMemo, useState, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { Favorites } from "./favorites";
import {
  ArrowPathIcon,
  ArrowUpTrayIcon,
  DocumentPlusIcon,
  FolderPlusIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  ControlledTreeEnvironment,
  Tree,
} from "react-complex-tree";
import "react-complex-tree/lib/style.css";
import { NOTE_PINNED } from "@/lib/notes/types/meta";
import { NoteModel } from "@/lib/notes/types/note";
import { useTreeData } from "./use-tree-data";
import { DeleteConfirmTarget, useSidebarActions } from "./use-sidebar-actions";
import {
  getVisibleRangeSelection,
  getVisibleTreeItemIds,
  toggleSelectedId,
} from "./selection-utils";
import { ROOT_ID } from "@/lib/notes/types/tree";

interface SidebarListProps {
  onOpenNote?: () => void;
}

const SidebarList = ({ onOpenNote }: SidebarListProps) => {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();

  const {
    loading,
    loadingChildren,
    movingIds,
    selectedIds,
    setSelectedIds,
    focusedId,
    setFocusedId,
    renamingId,
    setRenamingId,
    refreshTree,
  } = useNoteTreeStore();

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [deleteConfirmTarget, setDeleteConfirmTarget] =
    useState<DeleteConfirmTarget>(null);
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(
    null,
  );

  // active note from URL
  const activeId = useMemo(() => {
    if (!pathname || pathname === "/") return null;
    const segs = pathname.split("/").filter(Boolean);
    return segs[0] === "notes" ? (segs[1] ?? null) : (segs[0] ?? null);
  }, [pathname]);

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
    handleQuickNewNote,
    handleQuickNewFolder,
    handleUploadFiles,
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
  } = useSidebarActions({
    setDeleteConfirmTarget,
    deleteConfirmTarget,
    activeId,
    setSelectionAnchorId,
    onDeleteSelectionCleared: () => setSelectionAnchorId(null),
  });

  const visibleIds = useMemo(
    () => getVisibleTreeItemIds(tree, expandedIds),
    [tree, expandedIds],
  );

  const selectedItemIds = useMemo(
    () => Array.from(selectedIds).filter((id) => id !== ROOT_ID && tree.items[id]),
    [selectedIds, tree.items],
  );
  const selectedCount = selectedItemIds.length;
  const deleteIds = deleteConfirmTarget?.ids ?? [];
  const deleteHasFolder = deleteIds.some(
    (id) => (tree.items[id]?.children?.length ?? 0) > 0,
  );
  const singleDeleteId =
    deleteConfirmTarget?.mode === "single" ? deleteConfirmTarget.ids[0] : null;

  const handleRowClick = useCallback(
    (
      e: React.MouseEvent,
      itemId: string,
      isFolder: boolean,
      nodeData: NoteModel | undefined,
      isExpanded: boolean,
    ) => {
      if (e.shiftKey) {
        setSelectedIds(
          new Set(
            getVisibleRangeSelection(visibleIds, selectionAnchorId, itemId),
          ),
        );
        return;
      }

      if (e.metaKey || e.ctrlKey) {
        setSelectedIds(toggleSelectedId(selectedIds, itemId));
        setSelectionAnchorId(itemId);
        return;
      }

      setSelectedIds(new Set([itemId]));
      setSelectionAnchorId(itemId);

      if (isFolder) {
        const next = new Set(expandedIds);
        if (isExpanded) {
          next.delete(itemId);
        } else {
          next.add(itemId);
          const ti = useNoteTreeStore.getState().tree.items[itemId];
          if (ti && !ti.childrenLoaded) loadChildren(itemId);
        }
        setExpandedIds(next);
      } else if (nodeData) {
        const { setPaneA, setActivePane } = useLayoutStore.getState();
        setPaneA(buildFileSpec(nodeData));
        setActivePane("A");
        const href = pathname?.startsWith("/notes")
          ? `/notes/${itemId}`
          : `/${itemId}`;
        router.push(href);
        onOpenNote?.();
      }
    },
    [
      expandedIds,
      loadChildren,
      onOpenNote,
      pathname,
      router,
      selectedIds,
      selectionAnchorId,
      setExpandedIds,
      setSelectedIds,
      visibleIds,
    ],
  );

  // view state for react-complex-tree
  const viewState = useMemo(
    () => ({
      "notes-tree": {
        expandedItems: Array.from(expandedIds),
        selectedItems: Array.from(selectedIds),
        focusedItem: focusedId ?? undefined,
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
          className="group flex min-h-16 items-center gap-2 px-3 py-2 md:min-h-11 md:px-2 md:py-1"
          role="toolbar"
          aria-label={t("Notes actions")}
        >
          <span className="hidden flex-1 text-xs font-semibold tracking-wide text-text-tertiary md:block">
            {t("Notes")}
          </span>
          {/* action buttons - always visible */}
          <div className="flex w-full items-center gap-1 md:w-auto md:gap-0.5">
            <button
              type="button"
              onClick={() => {
                void refreshTree().catch(() => {});
              }}
              disabled={loading}
              className="ui-icon-button"
              aria-busy={loading}
              title={t("Refresh notes")}
              aria-label={t("Refresh notes")}
            >
              <ArrowPathIcon
                className={`h-[18px] w-[18px] ${loading ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              onClick={handleQuickNewNote}
              className="order-first flex min-h-11 flex-1 items-center justify-center gap-2 rounded-radius-md bg-primary-600 px-3 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background md:order-none md:h-8 md:min-h-8 md:w-8 md:flex-none md:bg-transparent md:px-0 md:text-text-secondary md:hover:bg-subtle"
              title={t("New note")}
              aria-label={t("New note")}
            >
              <DocumentPlusIcon className="h-[18px] w-[18px]" aria-hidden="true" />
              <span className="md:hidden">{t("New note")}</span>
            </button>
            <button
              type="button"
              onClick={handleQuickNewFolder}
              className="ui-icon-button"
              title={t("New folder")}
              aria-label={t("New folder")}
            >
              <FolderPlusIcon className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              className="ui-icon-button"
              title={t("Upload")}
              aria-label={t("Upload")}
            >
              <ArrowUpTrayIcon className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
            <input
              ref={uploadInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                if (files.length > 0) void handleUploadFiles(files);
              }}
            />
          </div>
        </div>

        {selectedCount > 1 && (
          <div className="mx-2 mb-2 flex flex-wrap items-center gap-2 rounded-radius-md border border-primary-500/20 bg-primary-500/10 px-2 py-1 text-xs text-text-secondary">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <span className="flex h-5 min-w-5 items-center justify-center rounded-radius-sm bg-primary-500/20 px-1 font-semibold tabular-nums text-primary-700 dark:text-primary-300">
                {selectedCount}
              </span>
              <span className="truncate font-medium">
                {selectedCount === 1 ? t("item selected") : t("items selected")}
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleBulkDeleteRequest(selectedItemIds);
              }}
              className="inline-flex min-h-11 items-center gap-1 rounded-radius-md px-2 font-medium text-error-700 transition-colors hover:bg-error-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-500 dark:text-error-400 md:min-h-7"
              title={t("Move to Trash")}
              aria-label={t("Move to Trash")}
            >
              <TrashIcon className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t("Move to Trash")}</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSelectedIds(new Set());
                setSelectionAnchorId(null);
              }}
              className="ui-icon-button"
              title={t("Clear selection")}
              aria-label={t("Clear selection")}
            >
              <XMarkIcon className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Tree */}
        <div className="flex-1 pb-4">
          <ControlledTreeEnvironment
            items={treeData}
            getItemTitle={(item) => item.data?.title ?? t("Untitled")}
            viewState={viewState}
            onExpandItem={handleExpandItem}
            onCollapseItem={handleCollapseItem}
            onSelectItems={(items) =>
              setSelectedIds(
                new Set(
                  items.filter((item): item is string => typeof item === "string"),
                ),
              )
            }
            onFocusItem={(item) =>
              setFocusedId(
                typeof item?.index === "string" ? item.index : null,
              )
            }
            onDrop={handleDrop}
            onMissingItems={onMissingItems}
            onStartRenamingItem={() => {}}
            canDragAndDrop
            canDrag={(items) => items.every((item) => !movingIds.has(String(item.index)))}
            canReorderItems={false}
            canDropOnFolder
          >
            <Tree
              treeId="notes-tree"
              rootItem="root"
              treeLabel={t("Notes")}
              renderItem={({ item, depth, children, context }) => {
                const nodeData = item.data;
                const hasChildren = !!(
                  item.children && item.children.length > 0
                );
                const isFolder =
                  item.isFolder || nodeData?.isFolder || hasChildren;
                const _isPinned = nodeData?.pinned === NOTE_PINNED.PINNED;
                // react-complex-tree exposes drop-target state, but not a
                // per-item dragging flag in its render context.
                const isDragging = false;
                const isDraggingOver = context.isDraggingOver === true;
                const itemId = String(item.index);
                const isExpanded = expandedIds.has(itemId);
                const isActive = activeId === item.index;
                const isItemRenaming = renamingId === item.index;
                const isSelected = selectedIds.has(itemId);

                return (
                  <TreeItem
                    key={itemId}
                    itemId={itemId}
                    nodeData={nodeData}
                    isFolder={!!isFolder}
                    isExpanded={isExpanded}
                    isActive={!!isActive}
                    isSelected={isSelected}
                    isDragging={isDragging}
                    isDraggingOver={isDraggingOver}
                    isLoading={loadingChildren.has(itemId) || movingIds.has(itemId)}
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
                    onClick={(e) =>
                      handleRowClick(
                        e,
                        itemId,
                        !!isFolder,
                        nodeData,
                        isExpanded,
                      )
                    }
                    onRenameComplete={async (newTitle) => {
                      if (nodeData) {
                        await mutateNote(itemId, { title: newTitle });
                      }
                      setRenamingId(null);
                    }}
                    onDotsClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      useContextMenuStore
                        .getState()
                        .setOpenMenu(
                          itemId,
                          rect.left,
                          rect.bottom + 4,
                          !!isFolder,
                          _isPinned,
                          isSelected && selectedIds.size > 1
                            ? Array.from(selectedIds)
                            : [itemId],
                        );
                      if (!isSelected || selectedIds.size <= 1) {
                        setSelectedIds(new Set([itemId]));
                        setSelectionAnchorId(itemId);
                      }
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

      <NoteContextMenu
        onRename={handleRename}
        onDelete={(ids) => {
          if (ids.length === 1) {
            handleDeleteRequest(ids[0]);
          } else {
            handleBulkDeleteRequest(ids);
          }
        }}
        onDuplicate={handleDuplicate}
        onTogglePin={handleTogglePin}
        onCreateNote={handleContextCreateNote}
        onCreateFolder={handleCreateFolder}
        onOpenInSplit={handleOpenInSplit}
        onOpenInAIChat={(id) => {
          const item = tree.items[id];
          const nodeData = item?.data;
          const isFolder = !!(nodeData?.isFolder || item?.children?.length);
          handleOpenInAIChat(id, nodeData, isFolder);
        }}
      />

      {/* delete confirmation overlay */}
      {deleteConfirmTarget && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50"
          onClick={() => setDeleteConfirmTarget(null)}
        >
          <div
            className="bg-surface rounded-radius-xl shadow-2xl ring-1 ring-border-subtle p-5 w-[calc(100%-2rem)] max-w-sm space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-text-secondary">
              {deleteConfirmTarget.mode === "bulk" ? (
                <>
                  <span className="font-medium text-text">
                    {t("Move to Trash")} {deleteIds.length} {t("selected items")}?
                  </span>
                  <span className="block mt-1 text-text-tertiary text-xs">
                    {deleteHasFolder
                      ? t("Selected folders and their contents will be moved to Trash.")
                      : t("The selected notes will be moved to Trash.")}
                  </span>
                </>
              ) : (
                <>
                  {t("Move to Trash")}{" "}
                  <span className="font-medium text-text">
                    {singleDeleteId
                      ? tree.items[singleDeleteId]?.data?.title ||
                        t("Untitled")
                      : t("Untitled")}
                  </span>
                  ?
                </>
              )}
              {deleteConfirmTarget.mode === "single" && deleteHasFolder && (
                <span className="block mt-1 text-text-tertiary text-xs">
                  {t("This folder and all its contents will be moved to Trash.")}
                </span>
              )}
              <span className="block mt-1 text-text-tertiary text-xs">
                {t("Items in Trash are permanently deleted after 30 days.")}
              </span>
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmTarget(null)}
                className="min-h-11 px-3 py-2 text-sm font-medium rounded-radius-md text-text-secondary hover:bg-subtle transition-colors"
              >
                {t("Cancel")}
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="min-h-11 px-3 py-2 text-sm font-medium rounded-radius-md bg-error-600 text-white hover:bg-error-700 transition-colors"
              >
                {t("Move to Trash")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default memo(SidebarList);
