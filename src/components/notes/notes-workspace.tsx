"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
} from "react-resizable-panels";
import useLayoutStore from "@/lib/notes/state/layout.zustand";
import useNoteTreeStore from "@/lib/notes/state/tree";
import { schedulePrefetch } from "@/lib/notes/prefetch";
import useMediaQuery from "@/lib/hooks/use-media-query";
import useI18n from "@/lib/notes/hooks/use-i18n";
import useNoteTreeInitialization from "@/lib/notes/hooks/use-note-tree-initialization";
import PrimaryNavigation from "@/components/navigation/primary-navigation";
import MobileAppHeader from "@/components/navigation/mobile-app-header";
import MobileDrawer from "@/components/navigation/mobile-drawer";
import MobileBottomNavigation from "@/components/navigation/mobile-bottom-navigation";
import MobileLibrary from "@/components/notes/mobile-library";

import { resolveNoteRoute } from "@/lib/notes/utils/note-route";
import { buildFileSpec } from "@/lib/notes/utils/file-spec";

const NoteTreePanel = dynamic(
  () => import("@/components/notes/note-tree-panel"),
);
const SplitEditorPane = dynamic(
  () => import("@/components/editor/split-editor-pane"),
);
const NoteInspectorPanel = dynamic(
  () => import("@/components/notes/note-inspector-panel"),
);
const TrashPage = dynamic(() => import("@/components/notes/trash-page"));

interface NotesWorkspaceProps {
  view?: "notes" | "trash";
}

export default function NotesWorkspace({
  view = "notes",
}: NotesWorkspaceProps) {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const hasInspectorSpace = useMediaQuery("(min-width: 1280px)");
  const noteDependenciesReady = useNoteTreeInitialization();
  const treeWidth = useLayoutStore((s) => s.treeWidth);
  const rightPanelWidth = useLayoutStore((s) => s.rightPanelWidth);
  const rightPanelOpen = useLayoutStore((s) => s.rightPanelOpen);
  const rightPanelTab = useLayoutStore((s) => s.rightPanelTab);
  const setRightPanelOpen = useLayoutStore((s) => s.setRightPanelOpen);
  const splitPosition = useLayoutStore((s) => s.splitPosition);
  const setSizes = useLayoutStore((s) => s.setSizes);
  const setPaneA = useLayoutStore((s) => s.setPaneA);
  const paneAFileId = useLayoutStore((s) => s.paneA.fileId);
  const treeGeneration = useNoteTreeStore((s) => s.generation);
  const routeRequestRef = useRef(0);
  const treeWidthRef = useRef(treeWidth);
  const rightPanelWidthRef = useRef(rightPanelWidth);
  const isTrashView = view === "trash";
  const showMobileLibrary = !isTrashView && pathname === "/notes";

  useEffect(() => {
    const requestId = ++routeRequestRef.current;
    if (!noteDependenciesReady) return;
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
    const requestGeneration = treeGeneration;
    const requestIsCurrent = () =>
      !controller.signal.aborted &&
      routeRequestRef.current === requestId &&
      useNoteTreeStore.getState().generation === requestGeneration;
    void fetch(`/api/notes/${fileId}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) {
          if (requestIsCurrent()) router.replace("/notes");
          return null;
        }
        if (!response.ok)
          throw new Error(`note fetch failed: ${response.status}`);
        const note = await response.json();
        if (requestIsCurrent() && note) {
          setPaneA(buildFileSpec(note));
        }
      })
      .catch((error) => {
        if (!requestIsCurrent()) return;
        console.error("Failed to resolve note route metadata:", error);
        setPaneA({ fileId, fileType: "note", title: fileId });
      });

    return () => controller.abort();
    // router is a stable Next.js ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteDependenciesReady, pathname, paneAFileId, setPaneA, treeGeneration]);

  const initLoaded = useNoteTreeStore((s) => s.initLoaded);
  useEffect(() => {
    if (initLoaded && isDesktop === true) schedulePrefetch();
  }, [initLoaded, isDesktop]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const state = useLayoutStore.getState();
      const target = event.target;
      const canSwitchPane =
        target === document.body ||
        (target instanceof HTMLElement &&
          target.dataset.paneShortcut === "true");

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
        ? t("Global Tasks")
        : t("Meta");

  return (
    <div className="relative flex h-dvh w-screen flex-col bg-background">
      {isTrashView && (
        <MobileAppHeader title={isTrashView ? t("Trash") : t("Notes")} />
      )}

      {hasInspectorSpace === false && (
        <>
          {!isTrashView && (
            <MobileDrawer
              open={rightPanelOpen}
              onClose={() => setRightPanelOpen(false)}
              title={inspectorTitle}
              side="right"
              className="xl:hidden"
              panelClassName="w-[94vw] max-w-md"
            >
              <NoteInspectorPanel presentation="drawer" />
            </MobileDrawer>
          )}
        </>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {isDesktop === true && (
          <div
            key="navigation"
            className="w-14 shrink-0 flex-col border-r border-border-subtle bg-background md:flex"
          >
            <PrimaryNavigation />
          </div>
        )}

        {isDesktop === true && (
          <PanelGroup
            orientation="horizontal"
            className="min-w-0 flex-1"
            onLayoutChanged={() => {
              setSizes(
                treeWidthRef.current,
                rightPanelWidthRef.current,
                splitPosition,
              );
            }}
          >
            <Panel
              id="note-tree"
              defaultSize={`${treeWidth}px`}
              minSize="200px"
              maxSize="600px"
              groupResizeBehavior="preserve-pixel-size"
              onResize={({ inPixels }) => {
                treeWidthRef.current = inPixels;
              }}
              className="flex min-w-0"
            >
              <div className="flex h-full w-full flex-col overflow-hidden bg-background">
                <NoteTreePanel />
              </div>
            </Panel>

            <PanelResizeHandle
              aria-label={t("Resize notes panel")}
              className="w-px cursor-col-resize bg-border-subtle transition-colors hover:bg-primary-500/40 active:bg-primary-500/60"
            />

            <Panel id="note-editor" minSize="320px" className="flex min-w-0">
              <main
                aria-label={isTrashView ? t("Trash") : t("Note editor")}
                className="h-full min-h-0 w-full overflow-hidden bg-background"
              >
                {!noteDependenciesReady ? (
                  <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
                    {t("Loading...")}
                  </div>
                ) : isTrashView ? (
                  <TrashPage />
                ) : (
                  <SplitEditorPane />
                )}
              </main>
            </Panel>

            {rightPanelOpen && hasInspectorSpace === true && !isTrashView && (
              <PanelResizeHandle
                aria-label={t("Resize details panel")}
                className="w-px cursor-col-resize bg-border-subtle transition-colors hover:bg-primary-500/40 active:bg-primary-500/60"
              />
            )}

            {rightPanelOpen && hasInspectorSpace === true && !isTrashView && (
              <Panel
                id="note-inspector"
                defaultSize={`${rightPanelWidth}px`}
                minSize="250px"
                maxSize="600px"
                groupResizeBehavior="preserve-pixel-size"
                onResize={({ inPixels }) => {
                  rightPanelWidthRef.current = inPixels;
                }}
                className="flex min-w-0"
              >
                <div className="glass-panel flex h-full w-full flex-col overflow-hidden">
                  <NoteInspectorPanel />
                </div>
              </Panel>
            )}
          </PanelGroup>
        )}

        {isDesktop !== true && (
          <main
            aria-label={
              isTrashView
                ? t("Trash")
                : showMobileLibrary
                  ? t("Notes")
                  : t("Note editor")
            }
            className="h-full min-h-0 w-full overflow-hidden bg-background"
          >
            {isDesktop === null || !noteDependenciesReady ? (
              <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
                {t("Loading...")}
              </div>
            ) : isTrashView ? (
              <TrashPage />
            ) : showMobileLibrary ? (
              <MobileLibrary />
            ) : (
              <SplitEditorPane />
            )}
          </main>
        )}
      </div>
      {(showMobileLibrary || isTrashView) && <MobileBottomNavigation />}
    </div>
  );
}
