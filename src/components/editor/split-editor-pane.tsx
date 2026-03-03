'use client';

import { FC } from 'react';
import useLayoutStore from '@/lib/notes/state/layout.zustand';
import FileViewPane from './file-view-pane';

/**
 * Main editor pane component
 * Renders Pane A (required) and optionally Pane B side-by-side
 */
const SplitEditorPane: FC = () => {
  const { paneA, paneB } = useLayoutStore();

  return (
    <div className="h-full flex flex-row gap-0">
      {/* Pane A: Main editor */}
      <div className="flex-1 min-w-0">
        <FileViewPane pane="A" file={paneA} />
      </div>
      
      {/* Pane B: Optional preview/split view */}
      {paneB && (
        <div className="flex-1 min-w-0 border-l border-neutral-700">
          <FileViewPane pane="B" file={paneB} />
        </div>
      )}
    </div>
  );
};

export default SplitEditorPane;
