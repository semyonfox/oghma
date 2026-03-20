'use client';

import { FC } from 'react';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels';
import useLayoutStore from '@/lib/notes/state/layout.zustand';
import FileViewPane from './file-view-pane';

/**
 * Main editor pane component with VS Code-style split behavior.
 * 
 * - Single pane by default (Pane A fills the space)
 * - Pane B appears only when explicitly triggered via "Open in split right" context menu
 * - No drag-to-split: splitting is context-menu only
 */
const SplitEditorPane: FC = () => {
  const { paneA, paneB } = useLayoutStore();

  // split is active only when pane B has a file
  const isSplitActive = paneB && paneB.fileId;

  if (!isSplitActive) {
    return (
      <div className="h-full w-full">
        <FileViewPane pane="A" file={paneA} />
      </div>
    );
  }

  return (
    <div className="h-full flex w-full">
      <PanelGroup orientation="horizontal" className="flex-1">
        {/* Pane A */}
        <Panel defaultSize={50} minSize={20} className="flex min-w-0">
          <div className="w-full h-full">
            <FileViewPane pane="A" file={paneA} />
          </div>
        </Panel>

        {/* Resize handle */}
        <PanelResizeHandle className="w-1 bg-surface-elevated/30 hover:bg-primary-500/70 active:bg-primary-500 transition-colors cursor-col-resize group flex items-center justify-center">
          <div className="w-0.5 h-8 bg-surface-elevated/50 group-hover:bg-primary-400 rounded-full transition-colors" />
        </PanelResizeHandle>

        {/* Pane B */}
        <Panel defaultSize={50} minSize={20} className="flex min-w-0">
          <div className="w-full h-full">
            <FileViewPane pane="B" file={paneB} />
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
};

export default SplitEditorPane;
