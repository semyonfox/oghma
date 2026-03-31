"use client";

import { FC } from "react";
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
} from "react-resizable-panels";
import useLayoutStore from "@/lib/notes/state/layout.zustand";
import EditorPane from "./editor-pane";

/**
 * Main editor pane component with VS Code-style split behavior.
 *
 * - Single pane by default (Pane A fills the space)
 * - Pane B appears only when explicitly triggered via "Open in split right" context menu
 * - No drag-to-split: splitting is context-menu only
 */
const SplitEditorPane: FC = () => {
  const paneA = useLayoutStore((s) => s.paneA);
  const paneB = useLayoutStore((s) => s.paneB);

  // split is active only when pane B has a file
  const isSplitActive = paneB && paneB.fileId;

  if (!isSplitActive) {
    return (
      <div className="h-full w-full">
        <EditorPane pane="A" file={paneA} />
      </div>
    );
  }

  return (
    <div className="h-full flex w-full">
      <PanelGroup orientation="horizontal" className="flex-1">
        {/* Pane A */}
        <Panel defaultSize={50} minSize={20} className="flex min-w-0">
          <div className="w-full h-full">
            <EditorPane pane="A" file={paneA} />
          </div>
        </Panel>

        {/* Resize handle */}
        <PanelResizeHandle className="w-px bg-border-subtle hover:bg-primary-500/40 active:bg-primary-500/60 transition-colors cursor-col-resize" />

        {/* Pane B */}
        <Panel defaultSize={50} minSize={20} className="flex min-w-0">
          <div className="w-full h-full">
            <EditorPane pane="B" file={paneB} />
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
};

export default SplitEditorPane;
