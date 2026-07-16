"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FolderOpenIcon } from "@heroicons/react/24/outline";
import useLayoutStore from "@/lib/notes/state/layout.zustand";
import useNoteTreeStore from "@/lib/notes/state/tree";
import { schedulePrefetch } from "@/lib/notes/prefetch";
import useMediaQuery from "@/lib/hooks/use-media-query";
import useI18n from "@/lib/notes/hooks/use-i18n";
import useNoteTreeInitialization from "@/lib/notes/hooks/use-note-tree-initialization";
import PrimaryNavigation from "@/components/navigation/primary-navigation";
import MobileAppHeader from "@/components/navigation/mobile-app-header";
import MobileDrawer from "@/components/navigation/mobile-drawer";
import NoteTreePanel from "@/components/notes/note-tree-panel";
import SplitEditorPane from "@/components/editor/split-editor-pane";
import NoteInspectorPanel from "@/components/notes/note-inspector-panel";
import { resolveNoteRoute } from "@/lib/notes/utils/note-route";
import { buildFileSpec } from "@/lib/notes/utils/file-spec";

export default function NotesWorkspace() {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const noteDependenciesReady = useNoteTreeInitialization();
  const [treeDrawerOpen, setTreeDrawerOpen] = useState(false);
  const treeWidth = useLayoutStore((s) => s.treeWidth);
  const rightPanelWidth = useLayoutStore((s) => s.rightPanelWidth);
  const rightPanelOpen = useLayoutStore((s) => s.rightPanelOpen);
  const rightPanelTab = useLayoutStore((s) => s.rightPanelTab);
  const setRightPanelOpen = useLayoutStore((s) => s.setRightPanelOpen);
  const setPaneA = useLayoutStore((s) => s.setPaneA);
  const paneAFileId = useLayoutStore((s) => s.paneA.fileId);

  useEffect(() => {
    const route = resolveNoteRoute(pathname);
    if (route.type === "ignore") return;

    if (route.type === "redirect") {
      console.warn(
        `[notes-workspace] non-UUID note id in URL: ${route.noteId} — redirecting to /notes`,
      );
      router.replace("/notes");
      return;
    }

    const fileId = route.noteId;
    if (fileId === paneAFileId) return;

    const controller = new AbortController();
    void fetch(`/api/notes/${fileId}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`note fetch failed: ${response.status}`);
        const note = await response.json();
        setPaneA(buildFileSpec(note));
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error("Failed to resolve note route metadata:", error);
        setPaneA({ fileId, fileType: "note", title: fileId });
      });

    return () => controller.abort();
    // router is a stable Next.js ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, paneAFileId, setPaneA]);

  const initLoaded = useNoteTreeStore((s) => s.initLoaded);
  useEffect(() => {
    if (initLoaded) schedulePrefetch();
  }, [initLoaded]);

  useEffect(() => {
    setTreeDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (rightPanelOpen) setTreeDrawerOpen(false);
  }, [rightPanelOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const state = useLayoutStore.getState();
      const target = event.target;
      const canSwitchPane =
        target === document.body ||
        (target instanceof HTMLElement && target.dataset.paneShortcut === "true");

      if (
        event.key === "Tab" &&
        isDesktop === true &&
        canSwitchPane &&
        state.paneB &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        state.setActivePane(state.activePane === "A" ? "B" : "A");
      }

      if (event.key === "Escape" && state.rightPanelOpen) {
        state.setRightPanelOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDesktop]);

  const inspectorTitle =
    rightPanelTab === "ai"
      ? t("AI Chat")
      : rightPanelTab === "tasks"
        ? t("Tasks")
        : t("Meta");

  return (
    <div className="relative flex h-dvh w-screen flex-col bg-background">
      <MobileAppHeader
        title={t("Notes")}
        actions={
          <button
            type="button"
            onClick={() => {
              setRightPanelOpen(false);
              setTreeDrawerOpen(true);
            }}
            className="flex h-11 w-11 items-center justify-center rounded-radius-md text-text-tertiary transition-colors hover:bg-subtle hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50"
            aria-label={t("Notes list")}
          >
            <FolderOpenIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        }
      />

      {isDesktop === false && (
        <>
          <MobileDrawer
            open={treeDrawerOpen}
            onClose={() => setTreeDrawerOpen(false)}
            title={t("Notes")}
            side="left"
            className="md:hidden"
          >
            <NoteTreePanel onOpenNote={() => setTreeDrawerOpen(false)} />
          </MobileDrawer>

          <MobileDrawer
            open={rightPanelOpen}
            onClose={() => setRightPanelOpen(false)}
            title={inspectorTitle}
            side="right"
            className="md:hidden"
            panelClassName="w-[94vw] max-w-md"
          >
            <NoteInspectorPanel />
          </MobileDrawer>
        </>
      )}

      <div
        className="min-h-0 flex-1 overflow-hidden md:grid"
        style={
          isDesktop === true
            ? {
                gridTemplateColumns: `3rem ${treeWidth}px 1fr ${rightPanelOpen ? rightPanelWidth : 0}px`,
                gap: "0",
              }
            : undefined
        }
      >
        {isDesktop === true && (
          <div
            key="navigation"
            className="flex flex-col overflow-hidden border-r border-border-subtle bg-background"
          >
            <PrimaryNavigation />
          </div>
        )}

        {isDesktop === true && (
          <div
            key="tree"
            className="flex flex-col overflow-hidden border-r border-border-subtle bg-background"
          >
            <NoteTreePanel />
          </div>
        )}

        <main
          key="editor"
          aria-label={t("Note editor")}
          className="h-full min-h-0 overflow-hidden bg-background"
        >
          {isDesktop === null || !noteDependenciesReady ? (
            <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
              {t("Loading...")}
            </div>
          ) : (
            <SplitEditorPane />
          )}
        </main>

        {isDesktop === true && rightPanelOpen && (
          <div
            key="inspector"
            className="glass-panel flex flex-col overflow-hidden"
          >
            <NoteInspectorPanel />
          </div>
        )}
      </div>
    </div>
  );
}
