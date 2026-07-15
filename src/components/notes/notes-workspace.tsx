"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import useLayoutStore from "@/lib/notes/state/layout.zustand";
import useNoteTreeStore from "@/lib/notes/state/tree";
import { schedulePrefetch } from "@/lib/notes/prefetch";
import PrimaryNavigation from "@/components/navigation/primary-navigation";
import NoteTreePanel from "@/components/notes/note-tree-panel";
import SplitEditorPane from "@/components/editor/split-pane";
import NoteInspectorPanel from "@/components/notes/note-inspector-panel";
import { resolveNoteRoute } from "@/lib/notes/utils/note-route";

/**
 * Main notes workspace, coordinating navigation, the note tree, editors, and inspector.
 *
 * Layout:
 * [48px Navigation] [220px Note tree] [Flexible editor] [0-280px Inspector]
 *
 * Uses CSS Grid for precise control and localStorage for persistent sizing
 *
 * Keyboard shortcuts:
 * - Tab: Switch between pane A and pane B (when in split mode)
 * - Escape: Close right panel
 */
export default function NotesWorkspace() {
  const pathname = usePathname();
  const router = useRouter();
  // granular selectors — only re-render when the specific values this
  // component reads actually change (not on every pane content update)
  const treeWidth = useLayoutStore((s) => s.treeWidth);
  const rightPanelWidth = useLayoutStore((s) => s.rightPanelWidth);
  const rightPanelOpen = useLayoutStore((s) => s.rightPanelOpen);
  const setPaneA = useLayoutStore((s) => s.setPaneA);
  // read paneA.fileId only (not the full object) to avoid re-renders on title/editMode changes
  const paneAFileId = useLayoutStore((s) => s.paneA.fileId);

  // Load file from URL path (e.g., /notes/<uuid>)
  useEffect(() => {
    const route = resolveNoteRoute(pathname);
    if (route.type === "ignore") return;

    // stale nanoid IDs (pre-UUID migration) — redirect to /notes rather than
    // hammering the server with requests it will always reject with 400
    if (route.type === "redirect") {
      console.warn(
        `[notes-workspace] non-UUID note id in URL: ${route.noteId} — redirecting to /notes`,
      );
      router.replace("/notes");
      return;
    }

    const fileId = route.noteId;
    if (fileId !== paneAFileId) {
      // The editor owns loading note content. Tree/sidebar navigation has already
      // supplied richer metadata when available; direct links only need an ID.
      setPaneA({
        fileId,
        fileType: "note",
        title: fileId,
      });
    }
    // router is a stable Next.js ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, paneAFileId, setPaneA]);

  // schedule background prefetch once tree finishes initialising
  const initLoaded = useNoteTreeStore((s) => s.initLoaded);
  useEffect(() => {
    if (initLoaded) schedulePrefetch();
  }, [initLoaded]);

  // Global keyboard shortcuts — reads state from store directly so the
  // listener never needs re-attaching on pane/panel changes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const state = useLayoutStore.getState();
      // Tab to switch panes (when split view is active)
      if (e.key === "Tab" && state.paneB && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        state.setActivePane(state.activePane === "A" ? "B" : "A");
      }
      // Escape to close right panel
      if (e.key === "Escape" && state.rightPanelOpen) {
        e.preventDefault();
        state.toggleRightPanel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="relative h-screen w-screen flex flex-col bg-background">
      {/* Main 3-pane container using CSS Grid */}
      <div
        className="flex-1 overflow-hidden grid"
        style={{
          gridTemplateColumns: `3rem ${treeWidth}px 1fr ${rightPanelOpen ? rightPanelWidth : 0}px`,
          gap: "0",
        }}
      >
        {/* Pane 1: Icon Navigation (Fixed 48px) */}
        <div className="bg-background border-r border-border-subtle overflow-hidden flex flex-col">
          <PrimaryNavigation />
        </div>

        {/* Pane 2: File Tree (Resizable, default 220px) */}
        <div className="bg-background border-r border-border-subtle overflow-hidden flex flex-col">
          <NoteTreePanel />
        </div>

        {/* Pane 3: Main Editor (Flex fill) */}
        <div className="bg-background overflow-hidden flex flex-col">
          <SplitEditorPane />
        </div>

        {/* Pane 4: Right Panel (Collapsible, default 280px) */}
        {rightPanelOpen && (
          <div className="glass-panel overflow-hidden flex flex-col">
            <NoteInspectorPanel />
          </div>
        )}
      </div>
    </div>
  );
}
