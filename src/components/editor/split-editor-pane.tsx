"use client";

import { FC, useEffect, useRef } from "react";
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
} from "react-resizable-panels";
import useMediaQuery from "@/lib/hooks/use-media-query";
import useLayoutStore from "@/lib/notes/state/layout";
import useI18n from "@/lib/notes/hooks/use-i18n";
import EditorPane from "./editor-pane";

const SplitEditorPane: FC<{ primaryLoading?: boolean }> = ({ primaryLoading = false }) => {
  const { t } = useI18n();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const paneA = useLayoutStore((s) => s.paneA);
  const paneB = useLayoutStore((s) => s.paneB);
  const setActivePane = useLayoutStore((s) => s.setActivePane);
  const isSplitActive = Boolean(paneB?.fileId);
  const wasSplitActive = useRef(isSplitActive);

  useEffect(() => {
    if (wasSplitActive.current && !isSplitActive) {
      document.querySelector<HTMLElement>('[data-editor-pane="A"]')?.focus();
    }
    wasSplitActive.current = isSplitActive;
  }, [isSplitActive]);

  useEffect(() => {
    if (isDesktop === false) setActivePane("A");
  }, [isDesktop, setActivePane]);

  const showSecondaryPane = isDesktop === true && isSplitActive;

  // Keep pane A under the same parents when the second pane opens or closes.
  // Replacing this group with a single-pane wrapper remounts the live editor.
  return (
    <div className="flex h-full w-full" data-pane-shortcut="true">
      <PanelGroup orientation="horizontal" className="flex-1">
        <Panel
          id="editor-a"
          defaultSize={50}
          minSize={20}
          className="flex min-w-0"
        >
          <div className="relative h-full w-full">
            <div className={primaryLoading ? "invisible h-full" : "h-full"} inert={primaryLoading}>
              <EditorPane
                pane="A"
                file={paneA}
                splitInteractionsEnabled={isDesktop === true}
                hasSecondaryPane={showSecondaryPane}
              />
            </div>
            {primaryLoading && (
              <div role="status" className="absolute inset-0 px-6 py-8 sm:px-10">
                <span className="sr-only">{t("Loading...")}</span>
                <div aria-hidden="true" className="mx-auto max-w-prose space-y-3">
                  <div className="skeleton mb-7 h-5 w-2/5 rounded-radius-sm" />
                  <div className="skeleton h-3 w-full rounded-radius-sm" />
                  <div className="skeleton h-3 w-11/12 rounded-radius-sm" />
                  <div className="skeleton h-3 w-4/5 rounded-radius-sm" />
                </div>
              </div>
            )}
          </div>
        </Panel>

        {showSecondaryPane && (
          <PanelResizeHandle className="w-px cursor-col-resize bg-border-subtle transition-colors hover:bg-accent/40 active:bg-accent/60" />
        )}

        {showSecondaryPane && (
          <Panel
            id="editor-b"
            defaultSize={50}
            minSize={20}
            className="flex min-w-0"
          >
            <div className="h-full w-full">
              <EditorPane pane="B" file={paneB ?? undefined} hasSecondaryPane />
            </div>
          </Panel>
        )}
      </PanelGroup>
    </div>
  );
};

export default SplitEditorPane;
