'use client';

import { FC, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { FileSpec } from '@/lib/notes/state/layout.zustand';
import { DocumentIcon, RectangleGroupIcon, XMarkIcon } from '@heroicons/react/24/outline';
import useLayoutStore from '@/lib/notes/state/layout.zustand';

const FileRenderer = dynamic(() => import('./file-renderer'), { ssr: false });

interface FileViewPaneProps {
  pane: 'A' | 'B';
  file?: FileSpec;
}

/**
 * Individual file view pane with header and dynamic renderer
 * Shows title, file type icon, and routes to appropriate viewer
 * Supports drag-to-swap: drag a file to right half to open in pane B, left half to swap to A
 */
const FileViewPane: FC<FileViewPaneProps> = ({ pane, file }) => {
  const { setPaneA, setPaneB, setActivePane, activePane, rightPanelOpen, toggleRightPanel, paneA, paneB } = useLayoutStore();
  const paneRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  if (!file || !file.fileId) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500">
        <DocumentIcon className="w-12 h-12 mb-4 text-gray-600" />
        <p className="text-sm">Select a file to open</p>
      </div>
    );
  }

  const handleClose = () => {
    if (pane === 'A') {
      setPaneA(undefined);
    } else {
      setPaneB(undefined);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (!file) return;
    e.dataTransfer.effectAllowed = 'move';
    // set both formats: application/json (standard) and paneFile (legacy compat)
    e.dataTransfer.setData('application/json', JSON.stringify(file));
    e.dataTransfer.setData('paneFile', JSON.stringify(file));
    setIsDragging(true);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    try {
      // accept application/json (sidebar drags) and paneFile (pane-to-pane drags)
      const jsonData = e.dataTransfer.getData('application/json');
      const paneFileData = e.dataTransfer.getData('paneFile');
      const rawData = jsonData || paneFileData;
      if (!rawData) return;

      const draggedFile: FileSpec = JSON.parse(rawData);
      if (!draggedFile.fileId) return;

      // Get the viewport width and drop position
      const viewportWidth = window.innerWidth;
      const dropX = e.clientX;
      const rightThreshold = viewportWidth / 2;

      // If dropped on right half: open in pane B
      if (dropX > rightThreshold) {
        if (pane === 'A') {
          // File from pane A dropped on right side
          setPaneB(draggedFile);
        } else {
          // File from pane B dropped on right side (no change needed)
          setPaneB(draggedFile);
        }
      } else {
        // If dropped on left half: open in pane A and move current to pane B
        if (pane === 'A') {
          // File from pane A dropped on left side (no swap needed)
          setPaneA(draggedFile);
        } else {
          // File from pane B dropped on left side: swap to A, current A goes to B
          setPaneA(draggedFile);
          setPaneB(paneA);
        }
      }
    } catch (error) {
      console.error('Drop error:', error);
    }
  };

  return (
    <div
      ref={paneRef}
      className={`h-full flex flex-col bg-gray-800 transition-colors ${
        activePane === pane ? 'ring-1 ring-inset ring-sky-500/40' : ''
      } ${isDragging ? 'opacity-60' : ''}`}
      onMouseDown={() => setActivePane(pane)}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Pane Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-white/10 flex items-center justify-between cursor-move">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono text-gray-500">Pane {pane}</span>
          <span className="text-sm text-gray-300 truncate">{file.title || file.fileId}</span>
          <span className="text-xs text-gray-600">({file.fileType})</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleRightPanel}
            className={`p-1.5 rounded transition-colors ${
              rightPanelOpen ? 'bg-white/10 text-gray-200' : 'text-gray-500 hover:bg-white/10 hover:text-gray-200'
            }`}
            title="Toggle metadata & inspector panel"
          >
            <RectangleGroupIcon className="w-4 h-4" />
          </button>
          {pane === 'B' && (
            <button
              onClick={handleClose}
              className="p-1 hover:bg-white/10 rounded text-gray-500 hover:text-gray-300 transition-colors"
              title="Close this pane"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* File Renderer */}
      <div className="flex-1 overflow-auto bg-gray-800">
        <FileRenderer key={file.fileId} pane={pane} file={file} />
      </div>
    </div>
  );
};

export default FileViewPane;
