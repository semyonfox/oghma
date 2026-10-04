"use client";

import { FC, memo, useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { FileSpec } from "@/lib/notes/state/layout.zustand";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClipboardDocumentCheckIcon,
  CloudArrowUpIcon,
  DocumentIcon,
  ExclamationTriangleIcon,
  RectangleGroupIcon,
  XMarkIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import useLayoutStore from "@/lib/notes/state/layout.zustand";
import type { RightPanelTab } from "@/lib/notes/state/layout.zustand";
import useSaveIndicatorStore, {
  PaneSaveIndicator,
} from "@/lib/notes/state/save-indicator";
import useI18n from "@/lib/notes/hooks/use-i18n";
import useNoteTreeStore from "@/lib/notes/state/tree";
import useNoteStore from "@/lib/notes/state/note";
import { buildFileSpec } from "@/lib/notes/utils/file-spec";
import { toast } from "sonner";

const FileRenderer = dynamic(() => import("./file-renderer"), { ssr: false });

interface EditorPaneProps {
  pane: "A" | "B";
  file?: FileSpec;
  splitInteractionsEnabled?: boolean;
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
}) => {
  const { t } = useI18n();
  const router = useRouter();

  // granular selectors — only re-render when values this component reads change
  const rightPanelOpen = useLayoutStore((s) => s.rightPanelOpen);
  const rightPanelTab = useLayoutStore((s) => s.rightPanelTab);
  const activePane = useLayoutStore((s) => s.activePane);
  const setPaneA = useLayoutStore((s) => s.setPaneA);
  const setPaneB = useLayoutStore((s) => s.setPaneB);
  const setActivePane = useLayoutStore((s) => s.setActivePane);
  const swapPanes = useLayoutStore((s) => s.swapPanes);
  const swapSaveIndicators = useSaveIndicatorStore((s) => s.swapPanes);
  const saveIndicator = useSaveIndicatorStore((s) => s.panes[pane]);
  const openRightPanelTab = useLayoutStore((s) => s.openRightPanelTab);
  const initLoaded = useNoteTreeStore((s) => s.initLoaded);
  const rootChildCount = useNoteTreeStore(
    (s) => s.tree.items.root?.children?.length ?? 0,
  );
  const genNewId = useNoteTreeStore((s) => s.genNewId);
  const setRenamingId = useNoteTreeStore((s) => s.setRenamingId);
  const createNote = useNoteStore((s) => s.createNote);

  const paneRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isCreatingFirstNote, setIsCreatingFirstNote] = useState(false);

  // all hooks must be called before any early returns
  const handleClose = useCallback(() => {
    if (pane === "A") {
      setPaneA(undefined);
    } else {
      setPaneB(undefined);
      setActivePane("A");
    }
  }, [pane, setPaneA, setPaneB, setActivePane]);

  const handlePanelToggle = (tab: RightPanelTab) => {
    const state = useLayoutStore.getState();
    const alreadyOpen = state.rightPanelOpen && state.rightPanelTab === tab;
    setActivePane(pane);
    if (alreadyOpen && state.activePane !== pane) return;
    openRightPanelTab(tab);
  };

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      if (!file || !splitInteractionsEnabled) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("application/json", JSON.stringify(file));
      e.dataTransfer.setData("paneFile", JSON.stringify(file));
      e.dataTransfer.setData("text/pane-source", pane);
      setIsDragging(true);
    },
    [file, pane, splitInteractionsEnabled],
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!splitInteractionsEnabled) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    },
    [splitInteractionsEnabled],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!splitInteractionsEnabled) return;
      e.preventDefault();
      setIsDragging(false);

      try {
        const jsonData = e.dataTransfer.getData("application/json");
        const paneFileData = e.dataTransfer.getData("paneFile");
        const rawData = jsonData || paneFileData;
        if (!rawData) return;

        const draggedFile: FileSpec = JSON.parse(rawData);
        if (!draggedFile.fileId) return;

        const sourcePane = e.dataTransfer.getData("text/pane-source");
        const { paneA: currentPaneA, paneB: currentPaneB } =
          useLayoutStore.getState();
        const isSplit = Boolean(currentPaneB?.fileId);

        // while split, each pane owns its own drop target. otherwise fall back
        // to halves of the single pane so a right-side drop opens the split.
        let targetPane: "A" | "B" = pane;
        if (!isSplit) {
          const rect = e.currentTarget.getBoundingClientRect();
          targetPane = e.clientX > rect.left + rect.width / 2 ? "B" : "A";
        }

        // dragging a pane onto the other pane swaps them instead of
        // overwriting the target and duplicating the dragged file
        if (
          (sourcePane === "A" || sourcePane === "B") &&
          sourcePane !== targetPane &&
          isSplit
        ) {
          swapPanes();
          swapSaveIndicators();
          setActivePane(targetPane);
          return;
        }

        // dropping a pane back on itself is a no-op
        if (sourcePane === targetPane) return;

        if (targetPane === "B") {
          setPaneB(draggedFile);
        } else {
          setPaneA(draggedFile);
          if (sourcePane === "B") setPaneB(currentPaneA);
        }
      } catch (error) {
        console.error("Drop error:", error);
      }
    },
    [
      pane,
      setActivePane,
      setPaneA,
      setPaneB,
      splitInteractionsEnabled,
      swapPanes,
      swapSaveIndicators,
    ],
  );

  const handleCreateFirstNote = useCallback(async () => {
    if (isCreatingFirstNote) return;
    setIsCreatingFirstNote(true);

    const id = genNewId();
    try {
      const note = await createNote({
        id,
        title: t("My first note"),
        content: t("# Welcome to OghmaNotes\n\nStart typing here."),
      });

      if (!note) {
        toast.error(t("Could not create your first note. Please try again."));
        return;
      }

      setPaneA(buildFileSpec(note));
      setRenamingId(id);
      router.push(`/notes/${id}`);
    } catch {
      toast.error(t("Could not create your first note. Please try again."));
    } finally {
      setIsCreatingFirstNote(false);
    }
  }, [
    createNote,
    genNewId,
    isCreatingFirstNote,
    router,
    setPaneA,
    setRenamingId,
    t,
  ]);

  const showFirstRunOnboarding =
    pane === "A" && initLoaded && rootChildCount === 0;
  const aiChatIsOpen = activePane === pane && rightPanelOpen && rightPanelTab === "ai";
  const metadataIsOpen = activePane === pane && rightPanelOpen && rightPanelTab === "meta";
  const tasksAreOpen = rightPanelOpen && rightPanelTab === "tasks";
  const aiChatLabel = aiChatIsOpen
    ? `${t("Close")} ${t("AI Chat")}`
    : t("Open AI chat");

  // empty state — no file assigned to this pane
  if (!file || !file.fileId) {
    if (showFirstRunOnboarding) {
      return (
        <div className="flex h-full flex-col overflow-y-auto p-6">
          <div className="mx-auto my-auto w-full max-w-lg rounded-radius-lg border border-border-subtle bg-surface/70 p-6">
            <h2 className="text-lg font-semibold text-text-secondary">
              {t("Welcome to OghmaNotes")}
            </h2>
            <p className="mt-2 text-sm text-text-tertiary leading-relaxed">
              {t(
                "You are all set. Create your first note now, then import your Canvas files when you are ready.",
              )}
            </p>
            <div className="mt-4 space-y-2 text-sm text-text-tertiary">
              <p>{t("1. Create your first note.")}</p>
              <p>{t("2. Import Canvas courses from Settings.")}</p>
              <p>
                {t("3. Open AI Chat when you want summaries or quick answers.")}
              </p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleCreateFirstNote()}
                disabled={isCreatingFirstNote}
                className="rounded-md bg-primary-600 px-3 py-2 text-sm font-semibold text-text-on-primary hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreatingFirstNote
                  ? t("Creating note...")
                  : t("Create first note")}
              </button>
              <a
                href="/settings#canvas"
                className="rounded-radius-md glass-card-interactive px-3 py-2 text-sm font-semibold text-text-secondary"
              >
                {t("Open Canvas import")}
              </a>
              <a
                href="/chat"
                className="rounded-radius-md glass-card-interactive px-3 py-2 text-sm font-semibold text-text-secondary"
              >
                {t("Open AI chat")}
              </a>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col items-center justify-center text-text-tertiary gap-3">
        <DocumentIcon className="w-8 h-8 opacity-20" />
        <div className="text-center">
          <p className="text-sm text-text-tertiary">
            {t("file_view_pane.select_file")}
          </p>
          <p className="text-xs text-text-tertiary/60 mt-1 max-w-[16rem] leading-relaxed">
            {t("file_view_pane.select_file_hint")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={paneRef}
      data-editor-pane={pane}
      tabIndex={-1}
      className={`h-full flex flex-col bg-background transition-colors ${isDragging ? "opacity-60" : ""}`}
      onMouseDown={(event) => {
        if (event.target instanceof Element && !event.target.closest("[data-inspector-toggle]")) setActivePane(pane);
      }}
      onFocusCapture={(event) => {
        if (event.target instanceof HTMLElement && !event.target.closest("[data-inspector-toggle]")) {
          setActivePane(pane);
        }
      }}
      onDragOver={splitInteractionsEnabled ? handleDragOver : undefined}
      onDrop={splitInteractionsEnabled ? handleDrop : undefined}
    >
      {/* Pane Header */}
      <div
        className={`flex h-12 flex-shrink-0 items-center justify-between border-b border-border-subtle px-3 md:h-9 ${
          splitInteractionsEnabled ? "cursor-move" : "cursor-default"
        }`}
        draggable={splitInteractionsEnabled}
        onDragStart={splitInteractionsEnabled ? handleDragStart : undefined}
        onDragEnd={splitInteractionsEnabled ? handleDragEnd : undefined}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate text-sm text-text-secondary">
            {file.title || file.fileId}
          </span>
          <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
            {saveIndicator?.fileId === file.fileId
              ? saveIndicator.state === "saving" ? t("Saving...")
                : saveIndicator.state === "saved" ? t("Saved")
                  : saveIndicator.state === "error" ? t("Save failed") : t("Unsaved")
              : ""}
          </span>
          {saveIndicator && saveIndicator.fileId === file.fileId ? (
            <SaveIndicatorButton indicator={saveIndicator} t={t} />
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            data-inspector-toggle
            onClick={() => handlePanelToggle("meta")}
            className={`flex h-10 w-10 items-center justify-center rounded transition-colors md:h-7 md:w-7 ${
              metadataIsOpen
                ? "bg-subtle text-text-secondary"
                : "text-text-tertiary hover:bg-subtle hover:text-text-secondary"
            }`}
            title={t("Toggle metadata panel")}
            aria-label={t("Toggle metadata panel")}
            aria-expanded={metadataIsOpen}
          >
            <RectangleGroupIcon className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            data-inspector-toggle
            onClick={() => handlePanelToggle("ai")}
            className={`flex h-10 w-10 items-center justify-center rounded transition-colors md:h-7 md:w-7 ${
              aiChatIsOpen
                ? "bg-subtle text-text-secondary"
                : "text-text-tertiary hover:bg-subtle hover:text-text-secondary"
            }`}
            title={aiChatLabel}
            aria-label={aiChatLabel}
            aria-expanded={aiChatIsOpen}
          >
            <SparklesIcon className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            data-inspector-toggle
            onClick={() => handlePanelToggle("tasks")}
            className={`flex h-10 w-10 items-center justify-center rounded transition-colors md:h-7 md:w-7 ${
              tasksAreOpen
                ? "bg-subtle text-text-secondary"
                : "text-text-tertiary hover:bg-subtle hover:text-text-secondary"
            }`}
            title={t("Global Tasks")}
            aria-label={t("Global Tasks")}
            aria-expanded={tasksAreOpen}
          >
            <ClipboardDocumentCheckIcon className="h-5 w-5" aria-hidden="true" />
          </button>
          {pane === "B" && (
            <button
              onClick={handleClose}
              aria-label={t("Close this pane")}
              className="flex h-10 w-10 items-center justify-center rounded text-text-tertiary transition-colors hover:bg-subtle hover:text-text-secondary md:h-auto md:w-auto md:p-1"
              title={t("Close this pane")}
            >
              <XMarkIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* File Renderer */}
      <div className="flex-1 overflow-auto bg-background">
        <FileRenderer key={file.fileId} pane={pane} file={file} />
      </div>
    </div>
  );
};

interface SaveIndicatorButtonProps {
  indicator: PaneSaveIndicator;
  t: (key: string) => string;
}

// compact save affordance living in the filename bar. idle/saved stays a quiet
// glyph, everything actionable becomes a real button
const SaveIndicatorButton: FC<SaveIndicatorButtonProps> = ({ indicator, t }) => {
  const { state, save } = indicator;

  if (state === "saved") {
    return (
      <span
        className="flex h-6 w-6 items-center justify-center text-text-tertiary/50"
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
        className="flex h-6 w-6 items-center justify-center text-text-tertiary"
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
      onClick={save}
      title={label}
      aria-label={label}
      className={`flex h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-radius-sm px-1.5 text-xs font-medium transition-colors md:h-6 md:min-w-0 ${
        isError
          ? "text-error-400 hover:bg-error-500/10"
          : "text-yellow-500 hover:bg-yellow-500/10"
      }`}
    >
      {isError ? (
        <ExclamationTriangleIcon className="h-4 w-4" aria-hidden="true" />
      ) : (
        <CloudArrowUpIcon className="h-4 w-4" aria-hidden="true" />
      )}
      <span className="hidden md:inline">
        {isError ? t("Save failed") : t("Unsaved")}
      </span>
    </button>
  );
};

export default memo(EditorPane);
