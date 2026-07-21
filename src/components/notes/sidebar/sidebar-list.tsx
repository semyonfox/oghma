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
  TreeItemIndex,
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

  const { loadingChildren, selectedIds, setSelectedIds, focusedId, setFocusedId } =
    useNoteTreeStore();

  const [renamingId, setRenamingId] = useState<string | null>(null);
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
    setRenamingId,
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
          className="group mt-1 flex h-12 items-center px-2 md:h-9"
          role="toolbar"
          aria-label={t("Notes actions")}
        >
          <span className="flex-1 text-xs font-semibold uppercase tracking-wider text-text-tertiary select-none">
            {t("Notes")}
          </span>
          {!initLoaded && (
            <ArrowPathIcon
              className="mr-1 h-3 w-3 animate-spin text-text-tertiary"
              aria-hidden="true"
            />
          )}
          {/* action buttons - always visible */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={handleQuickNewNote}
              className="flex h-10 w-10 items-center justify-center rounded-radius-sm text-text-tertiary transition-colors hover:bg-subtle hover:text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500/50 md:h-7 md:w-7"
              title={t("New note")}
              aria-label={t("New note")}
            >
              <DocumentPlusIcon className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleQuickNewFolder}
              className="flex h-10 w-10 items-center justify-center rounded-radius-sm text-text-tertiary transition-colors hover:bg-subtle hover:text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500/50 md:h-7 md:w-7"
              title={t("New folder")}
              aria-label={t("New folder")}
            >
              <FolderPlusIcon className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              className="flex h-10 w-10 items-center justify-center rounded-radius-sm text-text-tertiary transition-colors hover:bg-subtle hover:text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500/50 md:h-7 md:w-7"
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
          <div className="mx-2 mb-1 flex h-8 items-center gap-2 rounded-radius-md border border-primary-500/20 bg-primary-500/10 px-2 text-xs text-text-secondary">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <span className="flex h-4 min-w-4 items-center justify-center rounded-radius-sm bg-primary-500/20 px-1 font-semibold tabular-nums text-primary-300">
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
              className="inline-flex h-6 items-center gap-1 rounded-radius-sm bg-error-500/15 px-2 font-medium text-error-400 transition-colors hover:bg-error-500/25 hover:text-error-300 focus:outline-none focus:ring-1 focus:ring-error-500/50"
              title={t("Delete selected")}
              aria-label={t("Delete selected")}
            >
              <TrashIcon className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t("Delete")}</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSelectedIds(new Set());
                setSelectionAnchorId(null);
              }}
              className="flex h-6 w-6 items-center justify-center rounded-radius-sm text-text-tertiary transition-colors hover:bg-subtle hover:text-text-secondary focus:outline-none focus:ring-1 focus:ring-primary-500/50"
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
            className="bg-surface rounded-radius-lg shadow-2xl ring-1 ring-border-subtle p-5 w-[320px] space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-text-secondary">
              {deleteConfirmTarget.mode === "bulk" ? (
                <>
                  <span className="font-medium text-text">
                    {t("Delete")} {deleteIds.length} {t("selected items")}?
                  </span>
                  <span className="block mt-1 text-text-tertiary text-xs">
                    {deleteHasFolder
                      ? t("Selected folders and their contents will be deleted.")
                      : t("The selected notes will be deleted.")}
                  </span>
                </>
              ) : (
                <>
                  {t("Delete")}{" "}
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
                  {t("This folder and all its contents will be deleted.")}
                </span>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmTarget(null)}
                className="px-3 py-1.5 text-xs font-medium rounded-radius-sm text-text-secondary hover:bg-subtle transition-colors"
              >
                {t("Cancel")}
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-3 py-1.5 text-xs font-medium rounded-radius-sm bg-error-500/20 text-error-400 hover:bg-error-500/30 transition-colors"
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
