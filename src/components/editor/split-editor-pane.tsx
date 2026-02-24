'use client';

import { FC } from 'react';
import { Allotment } from 'allotment';
import 'allotment/dist/style.css';
import useLayoutStore from '@/lib/notes/state/layout.zustand';
import FileViewPane from './file-view-pane';

/**
 * Main split editor pane component
 * Uses Allotment (VS Code's original splitter) for smooth resizing
 * Renders Pane A (required) and optionally Pane B (if paneB is set)
 */
const SplitEditorPane: FC = () => {
  const { paneA, paneB, splitPosition, setSizes } = useLayoutStore();

  return (
    <div className="h-full flex flex-col">
      {paneB ? (
        // Split view: Pane A and Pane B side-by-side
        <Allotment
          onChange={(sizes) => {
            if (sizes.length >= 2) {
              setSizes(0, 0, sizes[0]); // Update split position
            }
          }}
        >
          <Allotment.Pane minSize={300}>
            <FileViewPane pane="A" file={paneA} />
          </Allotment.Pane>
          <Allotment.Pane minSize={300}>
            <FileViewPane pane="B" file={paneB} />
          </Allotment.Pane>
        </Allotment>
      ) : (
        // Single pane: Only Pane A
        <FileViewPane pane="A" file={paneA} />
      )}
    </div>
  );
};

export default SplitEditorPane;
