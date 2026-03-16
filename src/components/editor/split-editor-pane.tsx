'use client';

import { FC, useRef, useCallback } from 'react';
import useLayoutStore from '@/lib/notes/state/layout.zustand';
import FileViewPane from './file-view-pane';

/**
 * Main editor pane component
 * Renders Pane A (required) and optionally Pane B side-by-side
 * Smart drag-drop: drag files over LEFT→opens in paneA, RIGHT→opens in paneB
 * Files open immediately on drag, no empty panes
 */
const SplitEditorPane: FC = () => {
  const { paneA, paneB, setPaneA, setPaneB, draggedFile } = useLayoutStore();
  const dragTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';

    // Get dragged file from zustand store
    const file = useLayoutStore.getState().draggedFile;
    if (!file?.fileId) return;
    
    // Detect which side cursor is on
    const container = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const midpoint = container.left + container.width / 2;
    const isLeftSide = e.clientX < midpoint;

    // Clear any pending timeout
    if (dragTimeoutRef.current) {
      clearTimeout(dragTimeoutRef.current);
    }

    // Debounce to avoid rapid re-opens while dragging
    dragTimeoutRef.current = setTimeout(() => {
      if (isLeftSide) {
        setPaneA(file);
      } else {
        setPaneB(file);
      }
    }, 100);
  }, [setPaneA, setPaneB]);

  const handleDragLeave = useCallback(() => {
    if (dragTimeoutRef.current) {
      clearTimeout(dragTimeoutRef.current);
    }
  }, []);

  return (
    <div 
      className="h-full flex flex-row gap-0"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Pane A: Always rendered */}
      <div className="flex-1 min-w-0">
        <FileViewPane pane="A" file={paneA} />
      </div>
      
      {/* Pane B: Only rendered when it has content */}
      {paneB && (
        <div className="flex-1 min-w-0 border-l border-neutral-700">
          <FileViewPane pane="B" file={paneB} />
        </div>
      )}
    </div>
  );
};

export default SplitEditorPane;
