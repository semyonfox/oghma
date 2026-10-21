"use client";

import { FC, memo, useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { FileSpec, PaneId, type RightPanelTab } from "@/lib/notes/state/layout";
import {
  ArrowPathIcon,
  ArrowLeftIcon,
  EllipsisHorizontalIcon,
  CheckCircleIcon,
  ClipboardDocumentCheckIcon,
  CloudArrowUpIcon,
  DocumentIcon,
  ExclamationTriangleIcon,
  RectangleGroupIcon,
  XMarkIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import useLayoutStore from "@/lib/notes/state/layout";
import useSaveIndicatorStore, {
  FileSaveIndicator,
  saveIndicatorKey,
} from "@/lib/notes/state/save-indicator";
import useI18n from "@/lib/notes/hooks/use-i18n";
import useNoteTreeStore from "@/lib/notes/state/tree";
import {
  FILE_DRAG_MIME,
  parseFileDragPayload,
} from "@/lib/notes/utils/file-spec";

import SaveOfflineButton from "@/components/notes/save-offline-button";
import PaneEmptyState from "./pane-empty-state";
import { useSourceFile } from "./use-source-file";

const MobileNoteActions = dynamic(
  () => import("@/components/notes/mobile-note-actions"),
);
const mobileActionClass =
  "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-base text-text-secondary hover:bg-subtle";
const FileRenderer = dynamic(() => import("./file-renderer"), { ssr: false });

interface EditorPaneProps {
  pane: "A" | "B";
  file?: FileSpec;
  splitInteractionsEnabled?: boolean;
  hasSecondaryPane?: boolean;
}

/**
 * Individual file view pane with header and dynamic renderer
 * Shows title, file type icon, and routes to appropriate viewer
 * Supports drag-to-swap: drag a file to right half to open in pane B, left half to swap to A
 */
const EditorPane: FC<EditorPaneProps> = ({
  pane,
  file,
  splitInteractionsEnabled = true,
  hasSecondaryPane = false,
}) => {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const folderPath = searchParams.get("folder");
  const libraryHref = folderPath
    ? `/notes?folder=${encodeURIComponent(folderPath)}`
    : "/notes";
  const router = useRouter();
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const sourceFile = useSourceFile(
    file?.fileType === "note" ? file.fileId : undefined,
  );
  const liveTitle = useNoteTreeStore((s) =>
    file?.fileId ? s.tree.items[file.fileId]?.data?.title : undefined,
  );

  // granular selectors — only re-render when values this component reads change
  const activePane = useLayoutStore((s) => s.activePane);
  const setRightPanelTab = useLayoutStore((s) => s.setRightPanelTab);
  const setRightPanelOpen = useLayoutStore((s) => s.setRightPanelOpen);
  const rightPanelOpen = useLayoutStore((s) => s.rightPanelOpen);
  const rightPanelTab = useLayoutStore((s) => s.rightPanelTab);
  const setPaneA = useLayoutStore((s) => s.setPaneA);
  const setPaneB = useLayoutStore((s) => s.setPaneB);
  const placeFileInPane = useLayoutStore((s) => s.placeFileInPane);
  const setActivePane = useLayoutStore((s) => s.setActivePane);
  const saveIndicator = useSaveIndicatorStore((s) =>
    file?.fileId ? s.files[saveIndicatorKey(file.fileId, file.draftOwner ?? pane)] : undefined,
  );
  const openRightPanelTab = (tab: RightPanelTab) => {
    const sameContext = activePane === pane || tab === "tasks";
    const closing = sameContext && rightPanelOpen && rightPanelTab === tab;
    if (tab !== "tasks") setActivePane(pane);
    setRightPanelTab(tab);
    setRightPanelOpen(!closing);
  };

  const paneRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dropTarget, setDropTarget] = useState<PaneId | null>(null);

  // all hooks must be called before any early returns
  const handleClose = useCallback(() => {
    if (pane === "A") {
      setPaneA(undefined);
    } else {
      setPaneB(undefined);
    }
  }, [pane, setPaneA, setPaneB]);

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      if (!file || !splitInteractionsEnabled) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(
        FILE_DRAG_MIME,
        JSON.stringify({ file, sourcePane: pane }),
      );
      setIsDragging(true);
    },
    [file, pane, splitInteractionsEnabled],
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setDropTarget(null);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!splitInteractionsEnabled) return;
      // files dragged in from the desktop are the editor's to handle
      if (!e.dataTransfer.types.includes(FILE_DRAG_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";

      if (hasSecondaryPane || pane === "B") {
        setDropTarget(pane);
        return;
      }

      const rect = paneRef.current?.getBoundingClientRect();
      if (rect)
        setDropTarget(e.clientX >= rect.left + rect.width / 2 ? "B" : "A");
    },
    [hasSecondaryPane, pane, splitInteractionsEnabled],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    const nextTarget = e.relatedTarget;
    if (nextTarget instanceof Node && e.currentTarget.contains(nextTarget))
      return;
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!splitInteractionsEnabled) return;
      if (!e.dataTransfer.types.includes(FILE_DRAG_MIME)) return;
      e.preventDefault();
      setIsDragging(false);

      try {
        const payload = parseFileDragPayload(
          e.dataTransfer.getData(FILE_DRAG_MIME),
        );
        const target = dropTarget ?? pane;
        if (payload) placeFileInPane(payload.file, target, payload.sourcePane);
      } finally {
        setDropTarget(null);
      }
    },
    [dropTarget, pane, placeFileInPane, splitInteractionsEnabled],
  );

  const otherPane: PaneId = pane === "A" ? "B" : "A";
  const sourceIsOpenBeside = useLayoutStore((s) =>
    sourceFile
      ? (otherPane === "A" ? s.paneA : s.paneB)?.fileId === sourceFile.fileId
      : false,
  );
  const openSourceBeside = () => {
    if (!sourceFile) return;
    placeFileInPane(sourceFile, otherPane);
  };

  const aiChatIsOpen = activePane === pane && rightPanelOpen && rightPanelTab === "ai";
  const metadataIsOpen = activePane === pane && rightPanelOpen && rightPanelTab === "meta";
  const tasksAreOpen = rightPanelOpen && rightPanelTab === "tasks";
  const aiChatLabel = aiChatIsOpen
    ? `${t("Close")} ${t("AI Chat")}`
    : t("Open AI chat");

  // empty state — no file assigned to this pane
  if (!file || !file.fileId) return <PaneEmptyState pane={pane} />;

  return (
    <div
      ref={paneRef}
      data-editor-pane={pane}
      tabIndex={-1}
      className={`relative h-full flex flex-col bg-background transition-opacity ${isDragging ? "opacity-60" : ""}`}
      onMouseDown={(event) => {
        if (event.target instanceof Element && !event.target.closest("[data-inspector-toggle]")) setActivePane(pane);
      }}
      onFocusCapture={(event) => {
        if (event.target instanceof HTMLElement && !event.target.closest("[data-inspector-toggle]")) setActivePane(pane);
      }}
      onDragOver={splitInteractionsEnabled ? handleDragOver : undefined}
      onDragLeave={splitInteractionsEnabled ? handleDragLeave : undefined}
      onDrop={splitInteractionsEnabled ? handleDrop : undefined}
    >
      <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {saveIndicator ? saveIndicator.state === "saving" ? t("Saving...")
          : saveIndicator.state === "saved" ? t("Saved")
            : saveIndicator.state === "error" ? t("Save failed") : t("Unsaved") : ""}
      </span>
      {dropTarget && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-2 z-30 rounded-radius-md border border-primary-400/70 bg-primary-500/10 shadow-[inset_0_0_0_1px_rgb(96_165_250_/_0.14)] transition-[left,right] duration-100 ${
            !hasSecondaryPane && dropTarget === "A"
              ? "left-2 right-1/2"
              : !hasSecondaryPane && dropTarget === "B"
                ? "left-1/2 right-2"
                : "left-2 right-2"
          }`}
        />
      )}
      <div className="flex min-h-16 shrink-0 items-center gap-1 border-b border-border-subtle bg-background px-2 pt-[env(safe-area-inset-top)] lg:hidden">
        <Link
          href={libraryHref}
          className="ui-icon-button shrink-0"
          aria-label={t("Back to notes")}
        >
          <ArrowLeftIcon className="h-5 w-5" aria-hidden="true" />
        </Link>
        <div className="min-w-0 flex-1 px-1">
          <h1 className="truncate text-base font-semibold text-text">
            {liveTitle || file.title || t("Untitled")}
          </h1>
        </div>
        {saveIndicator && (
          <SaveIndicatorButton indicator={saveIndicator} t={t} />
        )}
        <button
          type="button"
          className="ui-icon-button shrink-0"
          data-inspector-toggle
          onClick={() => openRightPanelTab("ai")}
          aria-label={aiChatLabel}
          aria-expanded={aiChatIsOpen}
        >
          <SparklesIcon className="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="ui-icon-button shrink-0"
          onClick={() => setMobileActionsOpen(true)}
          aria-label={t("Note options")}
          aria-haspopup="dialog"
        >
          <EllipsisHorizontalIcon className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      {mobileActionsOpen && (
        <MobileNoteActions
          noteId={file.fileId}
          title={liveTitle || file.title}
          onClose={() => setMobileActionsOpen(false)}
        >
          <button
            type="button"
            className={mobileActionClass}
            onClick={() => {
              setMobileActionsOpen(false);
              openRightPanelTab("meta");
            }}
          >
            <RectangleGroupIcon className="h-5 w-5" aria-hidden="true" />
            {t("Meta")}
          </button>
          <button
            type="button"
            className={mobileActionClass}
            onClick={() => {
              setMobileActionsOpen(false);
              openRightPanelTab("tasks");
            }}
          >
            <ClipboardDocumentCheckIcon
              className="h-5 w-5"
              aria-hidden="true"
            />
            {t("Global Tasks")}
          </button>
          {sourceFile && (
            <button
              type="button"
              className={mobileActionClass}
              onClick={() => {
                setMobileActionsOpen(false);
                router.push(`/notes/${sourceFile.fileId}`);
              }}
            >
              <DocumentIcon className="h-5 w-5" aria-hidden="true" />
              {sourceFile.fileType === "pdf" ? t("Open original PDF") : t("Open original file")}
            </button>
          )}
          {file.fileType === "note" && (
            <SaveOfflineButton noteId={file.fileId} presentation="row" />
          )}
          <div className="my-2 border-t border-border-subtle" />
        </MobileNoteActions>
      )}
      {/* Pane Header */}
      <div
        className={`hidden min-h-11 flex-shrink-0 flex-wrap lg:flex items-center justify-between gap-x-3 border-b border-border-subtle px-3 py-1 lg:flex-nowrap ${
          splitInteractionsEnabled ? "cursor-move" : "cursor-default"
        }`}
        draggable={splitInteractionsEnabled}
        onDragStart={splitInteractionsEnabled ? handleDragStart : undefined}
        onDragEnd={splitInteractionsEnabled ? handleDragEnd : undefined}
      >
        <div className="flex min-h-8 w-full min-w-0 items-center gap-1.5 lg:w-auto lg:flex-1">
          <span
            className="truncate text-sm font-medium text-text-secondary"
            title={file.title || file.fileId}
          >
            {liveTitle || file.title || file.fileId}
          </span>
          {saveIndicator ? (
            <SaveIndicatorButton indicator={saveIndicator} t={t} />
          ) : null}
          {sourceFile && splitInteractionsEnabled && (
            <button
              type="button"
              onClick={openSourceBeside}
              aria-pressed={sourceIsOpenBeside}
              title={sourceFile.title}
              className={`ml-1 flex min-h-7 shrink-0 items-center gap-1 rounded-radius-md px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${
                sourceIsOpenBeside
                  ? "bg-primary-500/10 text-primary-700 dark:text-primary-300"
                  : "text-text-tertiary hover:bg-subtle hover:text-text-secondary"
              }`}
            >
              <DocumentIcon className="h-4 w-4 text-red-400" aria-hidden="true" />
              <span>
                {sourceFile.fileType === "pdf" ? t("Original PDF") : t("Original file")}
              </span>
            </button>
          )}
        </div>

        <div className="flex w-full shrink-0 items-center justify-end gap-1 lg:w-auto lg:gap-0.5">
          {file.fileType === "note" && (
            <SaveOfflineButton noteId={file.fileId} />
          )}
          <button
            type="button"
            data-inspector-toggle
            onClick={() => openRightPanelTab("meta")}
            className={`ui-icon-button w-auto gap-1.5 px-2 lg:w-8 lg:px-0 ${
              metadataIsOpen
                ? "bg-primary-500/10 text-primary-700 dark:text-primary-300"
                : "text-text-tertiary hover:bg-subtle hover:text-text-secondary"
            }`}
            title={t("Toggle metadata panel")}
            aria-label={t("Toggle metadata panel")}
            aria-expanded={metadataIsOpen}
          >
            <RectangleGroupIcon className="h-5 w-5" aria-hidden="true" />
            <span className="text-xs font-medium lg:hidden">{t("Meta")}</span>
          </button>
          <button
            type="button"
            data-inspector-toggle
            onClick={() => openRightPanelTab("ai")}
            className={`ui-icon-button w-auto gap-1.5 px-2 lg:w-8 lg:px-0 ${
              aiChatIsOpen
                ? "bg-primary-500/10 text-primary-700 dark:text-primary-300"
                : "text-text-tertiary hover:bg-subtle hover:text-text-secondary"
            }`}
            title={aiChatLabel}
            aria-label={aiChatLabel}
            aria-expanded={aiChatIsOpen}
          >
            <SparklesIcon className="h-5 w-5" aria-hidden="true" />
            <span className="text-xs font-medium lg:hidden">
              {t("AI Chat")}
            </span>
          </button>
          <button
            type="button"
            data-inspector-toggle
            onClick={() => openRightPanelTab("tasks")}
            className={`ui-icon-button w-auto gap-1.5 px-2 lg:w-8 lg:px-0 ${
              tasksAreOpen
                ? "bg-primary-500/10 text-primary-700 dark:text-primary-300"
                : "text-text-tertiary hover:bg-subtle hover:text-text-secondary"
            }`}
            title={t("Global Tasks")}
            aria-label={t("Global Tasks")}
            aria-expanded={tasksAreOpen}
          >
            <ClipboardDocumentCheckIcon
              className="h-5 w-5"
              aria-hidden="true"
            />
            <span className="text-xs font-medium lg:hidden">{t("Tasks")}</span>
          </button>
          {pane === "B" && (
            <button
              type="button"
              onClick={handleClose}
              className="ui-icon-button"
              title={t("Close this pane")}
              aria-label={t("Close this pane")}
            >
              <XMarkIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* File Renderer */}
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain bg-background">
        <FileRenderer key={file.fileId} pane={pane} file={file} />
      </div>
    </div>
  );
};

interface SaveIndicatorButtonProps {
  indicator: FileSaveIndicator;
  t: (key: string) => string;
}

// compact save affordance living in the filename bar. a settled note stays a
// quiet glyph; anything the user can act on becomes a real button
const SaveIndicatorButton: FC<SaveIndicatorButtonProps> = ({
  indicator,
  t,
}) => {
  const { state, save } = indicator;

  if (state === "saved") {
    return (
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center text-text-tertiary"
        title={t("Saved")}
        aria-label={t("Saved")}
      >
        <CheckCircleIcon className="h-4 w-4" aria-hidden="true" />
      </span>
    );
  }

  if (state === "saving") {
    return (
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center text-text-tertiary"
        title={t("Saving...")}
        aria-label={t("Saving...")}
      >
        <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
      </span>
    );
  }

  const isError = state === "error";
  const label = isError ? t("Retry save") : t("Save (Ctrl+S)");

  return (
    <button
      type="button"
      data-save-action
      onClick={(event) => {
        const paneElement = event.currentTarget.closest("[data-editor-pane]");
        if (paneElement instanceof HTMLElement) paneElement.focus({ preventScroll: true });
        save();
      }}
      title={label}
      aria-label={label}
      className={`flex min-h-11 shrink-0 items-center gap-1 rounded-radius-md px-2 text-xs font-medium transition-colors lg:min-h-7 ${
        isError
          ? "text-error-700 dark:text-error-400 hover:bg-error-500/10"
          : "text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
      }`}
    >
      {isError ? (
        <ExclamationTriangleIcon className="h-4 w-4" aria-hidden="true" />
      ) : (
        <CloudArrowUpIcon className="h-4 w-4" aria-hidden="true" />
      )}
      <span>{isError ? t("Save failed") : t("Unsaved")}</span>
    </button>
  );
};

export default memo(EditorPane);
