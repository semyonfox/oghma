'use client';

import { FC, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { FileSpec } from '@/lib/notes/state/layout.zustand';
import { DocumentIcon, XMarkIcon } from '@heroicons/react/24/outline';
import useLayoutStore from '@/lib/notes/state/layout.zustand';

const FileRenderer = dynamic(() => import('./file-renderer'), { ssr: false });

interface FileViewPaneProps {
  pane: 'A' | 'B';
  file?: FileSpec;
}

/**
 * Individual file view pane with header and dynamic renderer
 * Shows title, file type icon, and routes to appropriate viewer
 */
const FileViewPane: FC<FileViewPaneProps> = ({ pane, file }) => {
  const { setPaneA, setPaneB } = useLayoutStore();

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

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Pane Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono text-gray-500">Pane {pane}</span>
          <span className="text-sm text-gray-300 truncate">{file.title || file.fileId}</span>
          <span className="text-xs text-gray-600">({file.fileType})</span>
        </div>

        {pane === 'B' && (
          <button
            onClick={handleClose}
            className="p-1 hover:bg-white/10 rounded text-gray-500 hover:text-gray-300 transition-colors"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* File Renderer */}
      <div className="flex-1 overflow-auto bg-gray-900">
        <FileRenderer pane={pane} file={file} />
      </div>
    </div>
  );
};

export default FileViewPane;
