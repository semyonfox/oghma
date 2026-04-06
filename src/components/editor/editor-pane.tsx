"use client";

import { FC, memo, useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { FileSpec } from "@/lib/notes/state/layout.zustand";
import {
  DocumentIcon,
  RectangleGroupIcon,
  XMarkIcon,
  CpuChipIcon,
} from "@heroicons/react/24/outline";
import useLayoutStore from "@/lib/notes/state/layout.zustand";
import useI18n from "@/lib/notes/hooks/use-i18n";
import useNoteTreeStore from "@/lib/notes/state/tree";
import useNoteStore from "@/lib/notes/state/note";
import { buildFileSpec } from "@/lib/notes/utils/file-spec";
import { toast } from "sonner";

const FileRouter = dynamic(() => import("./file-router"), { ssr: false });

interface EditorPaneProps {
  pane: "A" | "B";
  file?: FileSpec;
}

/**
 * Individual file view pane with header and dynamic renderer
 * Shows title, file type icon, and routes to appropriate viewer
 * Supports drag-to-swap: drag a file to right half to open in pane B, left half to swap to A
 */
const EditorPane: FC<EditorPaneProps> = ({ pane, file }) => {
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
      if (!file) return;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("application/json", JSON.stringify(file));
      e.dataTransfer.setData("paneFile", JSON.stringify(file));
      setIsDragging(true);
    },
    [file],
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
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
    [pane, setPaneA, setPaneB],
  );

  const handleCreateFirstNote = useCallback(async () => {
    if (isCreatingFirstNote) return;
    setIsCreatingFirstNote(true);

    const id = genNewId();
    try {
      const note = await createNote({
        id,
        title: "My first note",
        content: "# Welcome to OghmaNotes\n\nStart typing here.",
      });

      if (!note) {
        toast.error("Could not create your first note. Please try again.");
        return;
      }

      setPaneA(buildFileSpec(note));
      router.push(`/notes/${id}`);
    } catch {
      toast.error("Could not create your first note. Please try again.");
    } finally {
      setIsCreatingFirstNote(false);
    }
  }, [createNote, genNewId, isCreatingFirstNote, router, setPaneA]);

  const showFirstRunOnboarding =
    pane === "A" && initLoaded && rootChildCount === 0;

  // empty state — no file assigned to this pane
  if (!file || !file.fileId) {
    if (showFirstRunOnboarding) {
      return (
        <div className="h-full flex items-center justify-center p-6">
          <div className="w-full max-w-lg rounded-radius-lg border border-border-subtle bg-surface/70 p-6">
            <h2 className="text-lg font-semibold text-text-secondary">
              Welcome to OghmaNotes
            </h2>
            <p className="mt-2 text-sm text-text-tertiary leading-relaxed">
              You are all set. Create your first note now, then import your
              Canvas files when you are ready.
            </p>
            <div className="mt-4 space-y-2 text-sm text-text-tertiary">
              <p>1. Create your first note.</p>
              <p>2. Import Canvas courses from Settings.</p>
              <p>3. Open AI Chat when you want summaries or quick answers.</p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleCreateFirstNote()}
                disabled={isCreatingFirstNote}
                className="rounded-md bg-primary-500 px-3 py-2 text-sm font-semibold text-text-on-primary hover:bg-primary-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreatingFirstNote ? "Creating note..." : "Create first note"}
              </button>
              <a
                href="/settings#canvas"
                className="rounded-radius-md glass-card-interactive px-3 py-2 text-sm font-semibold text-text-secondary"
              >
                Open Canvas import
              </a>
              <a
                href="/chat"
                className="rounded-radius-md glass-card-interactive px-3 py-2 text-sm font-semibold text-text-secondary"
              >
                Open AI chat
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
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Pane Header */}
      <div className="flex-shrink-0 h-9 px-3 border-b border-border-subtle flex items-center justify-between cursor-move">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm text-text-secondary truncate">
            {file.title || file.fileId}
          </span>
        </div>

        <div className="flex items-center gap-0.5">
          <button
            onClick={() => openRightPanelTab("meta")}
            className={`p-1 rounded transition-colors ${
              rightPanelOpen && rightPanelTab === "meta"
                ? "bg-white/[0.08] text-text-secondary"
                : "text-text-tertiary hover:bg-white/[0.06] hover:text-text-secondary"
            }`}
            title="Toggle metadata panel"
          >
            <RectangleGroupIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => openRightPanelTab("ai")}
            className={`p-1 rounded transition-colors ${
              rightPanelOpen && rightPanelTab === "ai"
                ? "bg-white/[0.08] text-text-secondary"
                : "text-text-tertiary hover:bg-white/[0.06] hover:text-text-secondary"
            }`}
            title="Toggle AI assistant panel"
          >
            <CpuChipIcon className="w-3.5 h-3.5" />
          </button>
          {pane === "B" && (
            <button
              onClick={handleClose}
              className="p-1 hover:bg-white/[0.06] rounded text-text-tertiary hover:text-text-secondary transition-colors"
              title="Close this pane"
            >
              <XMarkIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* File Renderer */}
      <div className="flex-1 overflow-auto bg-background">
        <FileRouter key={file.fileId} pane={pane} file={file} />
      </div>
    </div>
  );
};

export default memo(EditorPane);
