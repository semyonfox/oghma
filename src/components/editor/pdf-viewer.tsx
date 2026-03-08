'use client';

import { FC, useState, useCallback } from 'react';
import { FileSpec } from '@/lib/notes/state/layout.zustand';
import { Document, Page } from 'react-pdf';
import { ChevronLeftIcon, ChevronRightIcon, MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon } from '@heroicons/react/24/outline';
import { useFileUrl } from './use-file-url';

interface PDFViewerProps {
  file: FileSpec;
}

/**
 * PDF viewer component with zoom, page navigation, and text selection
 * Uses react-pdf (PDF.js wrapper)
 */
const PDFViewer: FC<PDFViewerProps> = ({ file }) => {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1);
  const { url: pdfPath, loading } = useFileUrl(file.sourcePath);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  }, []);

  const handleZoomIn = useCallback(() => {
    setScale((s) => Math.min(s + 0.2, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((s) => Math.max(s - 0.2, 0.5));
  }, []);

  const goToPreviousPage = useCallback(() => {
    setPageNumber((p) => Math.max(p - 1, 1));
  }, []);

  const goToNextPage = useCallback(() => {
    setPageNumber((p) => Math.min(p + 1, numPages || p));
  }, [numPages]);

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* Controls */}
      <div className="flex-shrink-0 px-4 py-3 bg-gray-900 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Page Navigation */}
          <button
            onClick={goToPreviousPage}
            disabled={pageNumber <= 1}
            className="p-2 rounded hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeftIcon className="w-4 h-4" />
          </button>

          <span className="text-xs text-gray-400">
            Page <input
              type="number"
              value={pageNumber}
              onChange={(e) => setPageNumber(Math.min(Math.max(1, parseInt(e.target.value) || 1), numPages || 1))}
              className="w-10 px-2 py-1 bg-gray-800 border border-white/10 rounded text-xs text-gray-300 text-center"
            /> of {numPages || '?'}
          </span>

          <button
            onClick={goToNextPage}
            disabled={pageNumber >= (numPages || 1)}
            className="p-2 rounded hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom Controls */}
          <button
            onClick={handleZoomOut}
            className="p-2 rounded hover:bg-white/10"
          >
            <MagnifyingGlassMinusIcon className="w-4 h-4" />
          </button>

          <span className="text-xs text-gray-400 min-w-12 text-center">
            {Math.round(scale * 100)}%
          </span>

          <button
            onClick={handleZoomIn}
            className="p-2 rounded hover:bg-white/10"
          >
            <MagnifyingGlassPlusIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* PDF Canvas */}
      <div className="flex-1 overflow-auto flex items-start justify-center bg-gray-950 p-4">
        <Document
          file={pdfPath}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={<div className="text-gray-500">{loading ? 'Loading PDF...' : 'Preparing PDF...'}</div>}
          error={<div className="text-red-500">Failed to load PDF</div>}
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            renderTextLayer
            renderAnnotationLayer
          />
        </Document>
      </div>
    </div>
  );
};

export default PDFViewer;
