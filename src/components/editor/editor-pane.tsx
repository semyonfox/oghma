"use client";

import { FC, memo, useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { FileSpec } from "@/lib/notes/state/layout.zustand";
import {
  ClipboardDocumentCheckIcon,
  DocumentIcon,
  RectangleGroupIcon,
  XMarkIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import useLayoutStore from "@/lib/notes/state/layout.zustand";
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
  const setPaneA = useLayoutStore((s) => s.setPaneA);
  const setPaneB = useLayoutStore((s) => s.setPaneB);
  const setActivePane = useLayoutStore((s) => s.setActivePane);
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
    }
  }, [pane, setPaneA, setPaneB]);

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      if (!file || !splitInteractionsEnabled) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("application/json", JSON.stringify(file));
      e.dataTransfer.setData("paneFile", JSON.stringify(file));
      setIsDragging(true);
    },
    [file, splitInteractionsEnabled],
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

        // read paneA at drop time (avoids subscribing to it in render)
        const currentPaneA = useLayoutStore.getState().paneA;

        const viewportWidth = window.innerWidth;
        const dropX = e.clientX;
        const rightThreshold = viewportWidth / 2;

        if (dropX > rightThreshold) {
          setPaneB(draggedFile);
        } else {
          if (pane === "A") {
            setPaneA(draggedFile);
          } else {
            setPaneA(draggedFile);
            setPaneB(currentPaneA);
          }
        }
      } catch (error) {
        console.error("Drop error:", error);
      }
    },
    [pane, setPaneA, setPaneB, splitInteractionsEnabled],
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
  const aiChatIsOpen = rightPanelOpen && rightPanelTab === "ai";
  const metadataIsOpen = rightPanelOpen && rightPanelTab === "meta";
  const tasksAreOpen = rightPanelOpen && rightPanelTab === "tasks";
  const aiChatLabel = aiChatIsOpen
    ? `${t("Close")} ${t("AI Chat")}`
    : t("Open AI chat");

  // empty state — no file assigned to this pane
  if (!file || !file.fileId) {
    if (showFirstRunOnboarding) {
      return (
        <div className="h-full flex items-center justify-center p-6">
          <div className="w-full max-w-lg rounded-radius-lg border border-border-subtle bg-surface/70 p-6">
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
      className={`h-full flex flex-col bg-background transition-colors ${isDragging ? "opacity-60" : ""}`}
      onMouseDown={() => setActivePane(pane)}
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
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm text-text-secondary truncate">
            {file.title || file.fileId}
          </span>
        </div>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => openRightPanelTab("meta")}
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
            onClick={() => openRightPanelTab("ai")}
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
            onClick={() => openRightPanelTab("tasks")}
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

export default memo(EditorPane);
