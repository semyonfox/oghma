"use client";

import { FC, useEffect } from "react";
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
} from "react-resizable-panels";
import useMediaQuery from "@/lib/hooks/use-media-query";
import useLayoutStore from "@/lib/notes/state/layout.zustand";
import EditorPane from "./editor-pane";

const SplitEditorPane: FC = () => {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const paneA = useLayoutStore((s) => s.paneA);
  const paneB = useLayoutStore((s) => s.paneB);
  const setActivePane = useLayoutStore((s) => s.setActivePane);
  const isSplitActive = Boolean(paneB?.fileId);

  useEffect(() => {
    if (isDesktop === false) setActivePane("A");
  }, [isDesktop, setActivePane]);

  if (isDesktop !== true || !isSplitActive) {
    return (
      <div className="h-full w-full">
        <EditorPane
          pane="A"
          file={paneA}
          splitInteractionsEnabled={isDesktop === true}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full" data-pane-shortcut="true">
      <PanelGroup orientation="horizontal" className="flex-1">
        <Panel defaultSize={50} minSize={20} className="flex min-w-0">
          <div className="h-full w-full">
            <EditorPane pane="A" file={paneA} />
          </div>
        </Panel>

        <PanelResizeHandle className="w-px cursor-col-resize bg-border-subtle transition-colors hover:bg-primary-500/40 active:bg-primary-500/60" />

        <Panel defaultSize={50} minSize={20} className="flex min-w-0">
          <div className="h-full w-full">
            <EditorPane pane="B" file={paneB ?? undefined} />
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
};

export default SplitEditorPane;
