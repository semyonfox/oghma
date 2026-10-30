// obsidian-style file tree using react-complex-tree for drag-and-drop
import NoteContextMenu from "./note-context-menu";
import TreeItem from "./tree-item";
import useNoteTreeStore from "@/lib/notes/state/tree";
import useLayoutStore from "@/lib/notes/state/layout";
import useContextMenuStore from "@/lib/notes/state/context-menu";
import { buildFileSpec, inferFileType } from "@/lib/notes/utils/file-spec";
import React, { useEffect, useState, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import useMediaQuery from "@/lib/hooks/use-media-query";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { Favorites } from "./favorites";
import {
  DocumentPlusIcon,
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
import { applyTreeView, topLevelAncestor } from "@/lib/notes/tree-view";
import { isFinishedCourse, nextFinishedOverride } from "@/lib/notes/tree-topics";
import useTagEditorStore, { type TagTarget } from "@/lib/notes/state/tag-editor";
import type { TagsViewFile } from "@/lib/notes/tags-view";
import { useCanvasImportNotification } from "@/components/canvas/canvas-import-notifications";
import { summarySchema } from "@/components/study-map/study-client";
import { toast } from "sonner";
import { z } from "zod";
import { TreeViewMenu } from "./tree-view-menu";
import { NewMenu } from "./new-menu";
import { TagsView } from "./tags-view";
import { TagEditor } from "./tag-editor";
import { useTreeViewSettings } from "./use-tree-view-settings";

interface SidebarListProps {
  onOpenNote?: () => void;
}

// active note from URL
function activeIdFromPath(pathname: string | null) {
  if (!pathname || pathname === "/") return null;
  const segs = pathname.split("/").filter(Boolean);
  return segs[0] === "notes" ? (segs[1] ?? null) : (segs[0] ?? null);
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

  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [deleteConfirmTarget, setDeleteConfirmTarget] =
    useState<DeleteConfirmTarget>(null);
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(
    null,
  );

  const activeId = activeIdFromPath(pathname);

  const storeTree = useNoteTreeStore((state) => state.tree);
  const { loaded: viewLoaded, view, hintSeen, updateView, dismissHint } = useTreeViewSettings();
  const [revealFinished, setRevealFinished] = useState(false);
  const shaped = applyTreeView(storeTree, view, { revealFinished, activeId });
  const treeData = useTreeData(shaped.tree);
  const activeRootId = topLevelAncestor(storeTree, activeId);
  const importing = useCanvasImportNotification()?.isImporting ?? false;
  const hasCanvasCourse = (storeTree.items[ROOT_ID]?.children ?? []).some(
    (id) => storeTree.items[id]?.data?.course?.isCanvasCourse,
  );
  const topicsReady = useTopicsReady();

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

  const visibleIds = getVisibleTreeItemIds(shaped.tree, expandedIds);

  const tagTargetFor = (id: string): TagTarget | null => {
    const data = tree.items[id]?.data;
    if (!data || (data.isFolder && !data.bundle)) return null;
    const isNote = !data.bundle && inferFileType(data.title, data.mimeType, data.s3Key) === "note";
    return {
      id,
      title: data.bundle ? data.title : data.title.replace(/\.md$/i, ""),
      materialId: data.bundle?.pdfId ?? id,
      noteId: data.bundle ? data.bundle.noteId : isNote ? id : null,
      courseId: topLevelAncestor(tree, id),
    };
  };

  const openTagEditor = (ids: string[]) => {
    const targets = ids.flatMap((id) => tagTargetFor(id) ?? []);
    if (targets.length === 0) return;
    const { position } = useContextMenuStore.getState();
    useTagEditorStore.getState().open(targets, position);
  };

  const toggleFinished = (id: string) => {
    const course = tree.items[id]?.data?.course;
    if (!course) return;
    const override = nextFinishedOverride(course);
    void fetch("/api/tree/course", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: id, finished: override }),
    })
      .then((response) => {
        if (!response.ok) throw new Error("course status not saved");
        return refreshTree();
      })
      .catch(() => toast.error(t("This change could not be saved. Try again.")));
  };

  const courseToggle = (id: string): { label: string; hint?: string } | null => {
    if (!storeTree.items[ROOT_ID]?.children.includes(id)) return null;
    const course = tree.items[id]?.data?.course;
    if (!course || tree.items[id]?.data?.bundle) return null;
    if (!isFinishedCourse(course)) return { label: t("Mark as finished") };
    return course.isCanvasCourse && course.canvasStatus === "past" && course.override === null
      ? { label: t("Keep as active"), hint: t("Canvas says finished") }
      : { label: t("Mark as active") };
  };

  const openTagsViewFile = (file: TagsViewFile) => {
    const { setPaneA, setPaneB, setActivePane } = useLayoutStore.getState();
    if (file.isFile && file.noteId) {
      // a PDF and its note open together, the way a document row does in the tree
      setPaneA({ fileId: file.noteId, fileType: "note", title: `${file.title}.md` });
      if (isDesktop === true) setPaneB({ fileId: file.id, fileType: "pdf", title: file.title });
    } else {
      setPaneA({
        fileId: file.id,
        fileType: file.isFile ? inferFileType(file.title, file.mimeType) : "note",
        title: file.title,
      });
    }
    setActivePane("A");
    const target = file.isFile && file.noteId ? file.noteId : file.id;
    router.push(pathname?.startsWith("/notes") ? `/notes/${target}` : `/${target}`);
    onOpenNote?.();
  };

  const selectedItemIds = Array.from(selectedIds).filter((id) => id !== ROOT_ID && tree.items[id]);
  const selectedCount = selectedItemIds.length;
  const deleteIds = deleteConfirmTarget?.ids ?? [];
  const deleteHasFolder = deleteIds.some(
    (id) => (tree.items[id]?.children?.length ?? 0) > 0,
  );
  const singleDeleteId =
    deleteConfirmTarget?.mode === "single" ? deleteConfirmTarget.ids[0] : null;

  const handleRowClick = (
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

    const bundle = nodeData?.bundle;
    if (isFolder && bundle) {
      // a PDF bundle opens as one document: the editable note, with the
      // original beside it on desktop. the chevron still expands the folder
      const { setPaneA, setPaneB, setActivePane } = useLayoutStore.getState();
      const title = nodeData?.title;
      const pdf = { fileId: bundle.pdfId, fileType: "pdf" as const, title: title ? `${title}.pdf` : undefined };
      const primaryId = bundle.noteId ?? bundle.pdfId;
      setPaneA(bundle.noteId
        ? { fileId: bundle.noteId, fileType: "note", title: title ? `${title}.md` : undefined }
        : pdf);
      if (bundle.noteId && isDesktop === true) setPaneB(pdf);
      setActivePane("A");
      router.push(pathname?.startsWith("/notes") ? `/notes/${primaryId}` : `/${primaryId}`);
      onOpenNote?.();
      return;
    }

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
  };

  // view state for react-complex-tree
  const viewState = {
    "notes-tree": {
      expandedItems: Array.from(expandedIds),
      selectedItems: Array.from(selectedIds),
      focusedItem: focusedId ?? undefined,
    },
  };

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
            <TreeViewMenu
              view={view}
              topicsReady={topicsReady}
              showHint={viewLoaded && !hintSeen && hasCanvasCourse && !importing}
              refreshing={loading}
              onRefresh={() => {
                void refreshTree().catch(() => {});
              }}
              onChange={updateView}
              onDismissHint={dismissHint}
            />
            <button
              type="button"
              onClick={handleQuickNewNote}
              className="order-first flex min-h-11 flex-1 items-center justify-center gap-2 rounded-radius-md bg-primary-600 px-3 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background md:hidden"
            >
              <DocumentPlusIcon className="h-[18px] w-[18px]" aria-hidden="true" />
              {t("New note")}
            </button>
            <NewMenu
              onNewNote={handleQuickNewNote}
              onNewFolder={handleQuickNewFolder}
              onUpload={() => uploadInputRef.current?.click()}
            />
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

        {view.group === "tags" ? (
          <TagsView activeRootId={activeRootId} onOpenFile={openTagsViewFile} />
        ) : (
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
                const isActive =
                  activeId === item.index ||
                  (!!nodeData?.bundle &&
                    (activeId === nodeData.bundle.noteId ||
                      activeId === nodeData.bundle.pdfId));
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
                    markStyle={view.marks}
                  >
                    {children}
                  </TreeItem>
                );
              }}
            />
          </ControlledTreeEnvironment>
          {(shaped.hiddenFinished.length > 0 || (revealFinished && shaped.shownFinished.length > 0)) && (
            <div className="mx-0.5 mt-1 flex min-h-12 items-center gap-2 rounded-radius-sm px-2 text-sm text-text-tertiary md:min-h-7 md:text-[13px]">
              <span className="min-w-0 flex-1 truncate">
                {t("{count} finished courses", {
                  count: revealFinished ? shaped.shownFinished.length : shaped.hiddenFinished.length,
                })}
              </span>
              <button
                type="button"
                onClick={() => setRevealFinished(!revealFinished)}
                className="min-h-11 shrink-0 rounded-radius-sm px-2 font-medium text-primary-700 hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 dark:text-primary-300 md:min-h-6"
              >
                {revealFinished ? t("Hide") : t("Show")}
              </button>
            </div>
          )}
        </div>
        )}
      </section>

      <TagEditor />

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
        canEditTags={(id) => tagTargetFor(id) !== null}
        onEditTags={openTagEditor}
        courseToggle={courseToggle}
        onToggleFinished={toggleFinished}
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

/** classified topics across the user's study maps, for the Tags entry in the View menu */
function useTopicsReady(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const request = new AbortController();
    void fetch("/api/study-maps", { signal: request.signal, cache: "no-store" })
      .then(async (response) => (response.ok ? z.array(summarySchema).parse(await response.json()) : []))
      .then((maps) => {
        if (!request.signal.aborted) {
          setCount(maps.reduce((sum, map) => sum + (map.materialCount > 0 ? map.topicCount : 0), 0));
        }
      })
      .catch(() => {});
    return () => request.abort();
  }, []);
  return count;
}

export default SidebarList;
