'use client';

import { FC, useState, useCallback } from 'react';
import { FileSpec } from '@/lib/notes/state/layout.zustand';
import { Document, Page, pdfjs } from 'react-pdf';
import { MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon } from '@heroicons/react/24/outline';
import { useFileUrl } from './use-file-url';
import useI18n from '@/lib/notes/hooks/use-i18n';

// Import react-pdf styles for text layer and annotations
// Must be imported before Page component is rendered
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

// Configure PDF.js worker - use local file from public folder
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.js';
}

interface PDFViewerProps {
  file: FileSpec;
  pane: 'A' | 'B';
}

/**
 * PDF viewer component with continuous scrolling through all pages
 * Uses react-pdf (PDF.js wrapper)
 */
const PDFViewer: FC<PDFViewerProps> = ({ file, pane }) => {
   const { t } = useI18n();
   const [numPages, setNumPages] = useState<number | null>(null);
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

  return (
    <div className="h-full flex flex-col bg-gray-800">
       {/* Controls */}
       <div className="flex-shrink-0 px-4 py-3 bg-gray-900 border-b border-white/10 flex items-center justify-between">
         <div className="text-xs text-gray-400">
           {numPages ? t('pdf_viewer.page_count', { count: numPages }) : t('Loading...')}
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

      {/* PDF Canvas - Scrollable */}
      <div className="flex-1 overflow-y-auto flex items-start justify-center bg-gray-800 p-4">
         <Document
           file={pdfPath}
           onLoadSuccess={onDocumentLoadSuccess}
           loading={<div className="text-gray-500">{loading ? t('pdf_viewer.loading') : t('pdf_viewer.preparing')}</div>}
           error={<div className="text-red-500">{t('pdf_viewer.error')}</div>}
         >
          <div className="flex flex-col gap-4">
            {numPages && Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
              <div key={pageNum} className="flex justify-center">
                <Page
                  pageNumber={pageNum}
                  scale={scale}
                  renderTextLayer
                  renderAnnotationLayer
                />
              </div>
            ))}
          </div>
        </Document>
      </div>
    </div>
  );
};

export default PDFViewer;
