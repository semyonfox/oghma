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

      {!paneB && (
        <div className="hidden xl:flex flex-1 min-w-0 border-l border-neutral-800 bg-gray-950/60">
          <div className="m-auto max-w-sm px-8 text-center">
            <p className="text-sm text-gray-300">Open a second file in the right pane</p>
            <p className="mt-2 text-xs text-gray-500">
              Use the `R` action in the tree to place a note, PDF, image, or video beside the current file.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SplitEditorPane;
