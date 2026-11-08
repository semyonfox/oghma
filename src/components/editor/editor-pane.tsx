"use client";

import { FC, useEffect, useRef, useState } from "react";
import { z } from "zod";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { FileSpec, PaneId, type RightPanelTab } from "@/lib/notes/state/layout";
import {
  ArrowPathIcon,
  ArrowLeftIcon,
  EllipsisHorizontalIcon,
  ClipboardDocumentCheckIcon,
  CloudArrowUpIcon,
  DocumentIcon,
  ExclamationTriangleIcon,
  RectangleGroupIcon,
  ViewColumnsIcon,
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
import { splitModuleCode } from "@/lib/notes/module-code";
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
const pathSchema = z.object({
  path: z.array(z.object({ id: z.string(), title: z.string().nullable() })),
});

// the outermost folder (usually the course) for the header breadcrumb
function useCourseTitle(fileId: string | undefined): string | undefined {
  const [state, setState] = useState<{ fileId: string; title: string | undefined }>();
  useEffect(() => {
    if (!fileId) return;
    let cancelled = false;
    void fetch(`/api/notes/${encodeURIComponent(fileId)}/path`)
      .then(async (response) => (response.ok ? pathSchema.safeParse(await response.json()) : null))
      .catch(() => null)
      .then((parsed) => {
        if (cancelled) return;
        setState({ fileId, title: parsed?.success ? parsed.data.path[0]?.title ?? undefined : undefined });
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);
  return state && state.fileId === fileId ? state.title : undefined;
}

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
  const handleClose = () => {
    if (pane === "A") {
      setPaneA(undefined);
    } else {
      setPaneB(undefined);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
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
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    setDropTarget(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
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
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const nextTarget = e.relatedTarget;
    if (nextTarget instanceof Node && e.currentTarget.contains(nextTarget))
      return;
    setDropTarget(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!splitInteractionsEnabled) return;
    if (!e.dataTransfer.types.includes(FILE_DRAG_MIME)) return;
    e.preventDefault();
    setIsDragging(false);
    setDropTarget(null);

    const payload = parseFileDragPayload(
      e.dataTransfer.getData(FILE_DRAG_MIME),
    );
    const target = dropTarget ?? pane;
    if (payload) placeFileInPane(payload.file, target, payload.sourcePane);
  };

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

  const panelIsOpen = rightPanelOpen && (activePane === pane || rightPanelTab === "tasks");
  const togglePanel = () => {
    if (panelIsOpen) {
      setRightPanelOpen(false);
      return;
    }
    setActivePane(pane);
    setRightPanelOpen(true);
  };
  const courseTitle = useCourseTitle(file?.fileId);
  const courseCode = courseTitle ? splitModuleCode(courseTitle).code : null;
  const metadataIsOpen = activePane === pane && rightPanelOpen && rightPanelTab === "meta";

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
          className={`pointer-events-none absolute inset-y-2 z-30 rounded-radius-md border border-accent/60 bg-accent-soft/60 transition-[left,right] duration-100 ${
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
        <div className="flex min-w-0 flex-1 flex-col px-1">
          <h1 className="truncate text-[17px] font-semibold text-text">
            {liveTitle || file.title || t("Untitled")}
          </h1>
          {(courseCode || saveIndicator) && (
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-text-secondary">
              {courseCode && <span className="font-mono">{courseCode}</span>}
              {courseCode && saveIndicator && <span aria-hidden="true">·</span>}
              {saveIndicator && <SaveIndicatorButton indicator={saveIndicator} t={t} />}
            </span>
          )}
        </div>
        <button
          type="button"
          className="ui-icon-button shrink-0"
          data-inspector-toggle
          onClick={() => openRightPanelTab("meta")}
          aria-label={t("Toggle metadata panel")}
          aria-expanded={metadataIsOpen}
        >
          <ViewColumnsIcon className="h-5 w-5" aria-hidden="true" />
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
          {courseTitle && (
            <>
              <span className="max-w-[40%] truncate text-sm text-text-secondary">
                {splitModuleCode(courseTitle).title}
              </span>
              <span aria-hidden="true" className="px-1 text-sm text-text-tertiary">/</span>
            </>
          )}
          <span
            className="truncate text-sm font-medium text-text"
            title={file.title || file.fileId}
          >
            {liveTitle || file.title || file.fileId}
          </span>
        </div>

        <div className="flex w-full shrink-0 items-center justify-end gap-1.5 lg:w-auto">
          {sourceFile && splitInteractionsEnabled && (
            <button
              type="button"
              onClick={openSourceBeside}
              aria-pressed={sourceIsOpenBeside}
              title={sourceFile.title}
              className={`ml-1 flex min-h-7 shrink-0 items-center gap-1 rounded-radius-md px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                sourceIsOpenBeside
                  ? "atlas-raised text-text"
                  : "border border-border bg-surface text-text-secondary hover:bg-subtle hover:text-text"
              }`}
            >
              <DocumentIcon className="h-4 w-4" aria-hidden="true" />
              <span>
                {sourceFile.fileType === "pdf" ? t("Original PDF") : t("Original file")}
              </span>
            </button>
          )}
          {saveIndicator ? (
            <SaveIndicatorButton indicator={saveIndicator} t={t} />
          ) : null}
          {file.fileType === "note" && (
            <SaveOfflineButton noteId={file.fileId} />
          )}
          <button
            type="button"
            data-inspector-toggle
            onClick={togglePanel}
            className={`ui-icon-button ${
              panelIsOpen
                ? "atlas-raised text-text"
                : "text-text-tertiary hover:bg-subtle hover:text-text"
            }`}
            title={t("Toggle side panel")}
            aria-label={t("Toggle side panel")}
            aria-expanded={panelIsOpen}
          >
            <ViewColumnsIcon className="h-5 w-5" aria-hidden="true" />
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

      {/* phone action bar from the Atlas mockup */}
      <div className="flex shrink-0 gap-2 border-t border-border-subtle bg-sidebar px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 lg:hidden">
        {sourceFile && (
          <button
            type="button"
            onClick={() => router.push(`/notes/${sourceFile.fileId}`)}
            className="flex min-h-12 min-w-0 flex-1 flex-col justify-center rounded-radius-lg border border-border bg-surface px-3 text-left"
          >
            <span className="text-[11px] font-semibold text-accent">
              {sourceFile.fileType === "pdf" ? t("Original PDF") : t("Original file")}
            </span>
            <span className="truncate text-[13px] text-text">{sourceFile.title}</span>
          </button>
        )}
        <button
          type="button"
          data-inspector-toggle
          onClick={() => openRightPanelTab("ai")}
          className="flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-radius-lg bg-action px-3 text-sm font-medium text-on-action hover:bg-action-hover"
        >
          <SparklesIcon className="h-4 w-4" aria-hidden="true" />
          {t("Ask about this note")}
        </button>
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
        className="flex h-6 shrink-0 items-center gap-1.5 px-1 text-xs text-text-tertiary"
        title={t("Saved")}
        aria-label={t("Saved")}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-success-500" aria-hidden="true" />
        <span aria-hidden="true">{t("Saved")}</span>
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
          : "text-warning-700 dark:text-warning-400 hover:bg-warning-500/10"
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

export default EditorPane;
