"use client";

import { FC, ReactNode, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import useLayoutStore from "@/lib/notes/state/layout.zustand";
import IconNav from "@/components/sidebar/icon-nav";
import FileTreePanel from "@/components/sidebar/file-tree-panel";
import SplitEditorPane from "@/components/editor/split-editor-pane";
import NotesInspectorSidebar from "@/components/panels/notes-inspector-sidebar";
import { buildFileSpec } from "@/lib/notes/utils/file-spec";

/**
 * Main VSCode-style 4-pane layout container
 *
 * Layout:
 * [48px Icon Nav] [220px Tree] [Flex Editor] [0-280px Inspector (hidden by default)]
 *
 * Uses CSS Grid for precise control and localStorage for persistent sizing
 *
 * Keyboard shortcuts:
 * - Tab: Switch between pane A and pane B (when in split mode)
 * - Escape: Close right panel
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VSCodeLayout: FC<{ children?: ReactNode }> = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { treeWidth, rightPanelWidth, rightPanelOpen, paneB, setPaneA, paneA } =
    useLayoutStore();

  // Load file from URL path (e.g., /notes/<uuid>)
  useEffect(() => {
    if (!pathname || !pathname.startsWith("/notes/")) return;

    const fileId = pathname.replace("/notes/", "").split("/")[0];
    if (!fileId) return;

    // stale nanoid IDs (pre-UUID migration) — redirect to /notes rather than
    // hammering the server with requests it will always reject with 400
    if (!UUID_RE.test(fileId)) {
      console.warn(
        `[layout] non-UUID note id in URL: ${fileId} — redirecting to /notes`,
      );
      router.replace("/notes");
      return;
    }

    let cancelled = false;

    const syncPaneFromRoute = async () => {
      try {
        const response = await fetch(
          `/api/notes/${fileId}?fields=note_id,title,content`,
        );
        if (!response.ok) {
          if (!cancelled && fileId !== paneA.fileId) {
            setPaneA({
              fileId,
              fileType: "note",
              title: fileId,
            });
          }
          return;
        }

        const note = await response.json();
        if (!cancelled) {
          setPaneA(
            buildFileSpec({
              id: note.note_id || fileId,
              title: note.title || fileId,
              content: note.content,
            }),
          );
        }
      } catch {
        if (!cancelled && fileId !== paneA.fileId) {
          setPaneA({
            fileId,
            fileType: "note",
            title: fileId,
          });
        }
      }
    };

    void syncPaneFromRoute();

    return () => {
      cancelled = true;
    };
  }, [pathname, paneA.fileId, setPaneA]);

  // Global keyboard shortcuts - optimized to prevent constant re-attachment
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Tab to switch panes (when split view is active)
      if (e.key === "Tab" && paneB && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        const state = useLayoutStore.getState();
        state.setActivePane(state.activePane === "A" ? "B" : "A");
      }
      // Escape to close right panel
      if (e.key === "Escape" && rightPanelOpen) {
        e.preventDefault();
        useLayoutStore.getState().toggleRightPanel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [paneB, rightPanelOpen]);

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
        <div className="bg-background border-r border-border-subtle overflow-y-auto flex flex-col">
          <IconNav />
        </div>

        {/* Pane 2: File Tree (Resizable, default 220px) */}
        <div className="bg-background border-r border-border-subtle overflow-hidden flex flex-col">
          <FileTreePanel />
        </div>

        {/* Pane 3: Main Editor (Flex fill) */}
        <div className="bg-background overflow-hidden flex flex-col">
          <SplitEditorPane />
        </div>

        {/* Pane 4: Right Panel (Collapsible, default 280px) */}
        {rightPanelOpen && (
          <div className="bg-surface border-l border-border-subtle overflow-hidden flex flex-col">
            <NotesInspectorSidebar />
          </div>
        )}
      </div>
    </div>
  );
};

export default VSCodeLayout;
