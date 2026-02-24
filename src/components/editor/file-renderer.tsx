'use client';

import { FC, Suspense } from 'react';
import { FileSpec } from '@/lib/notes/state/layout.zustand';
import MarkdownEditor from './markdown-editor';
import PDFViewer from './pdf-viewer';
import ImageViewer from './image-viewer';
import VideoViewer from './video-viewer';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface FileRendererProps {
  pane: 'A' | 'B';
  file: FileSpec;
}

/**
 * Dynamic file renderer
 * Routes to appropriate viewer based on file type
 */
const FileRenderer: FC<FileRendererProps> = ({ pane, file }) => {
  // Loading fallback
  const LoadingFallback = () => (
    <div className="w-full h-full flex items-center justify-center text-gray-500">
      <div className="text-center">
        <div className="w-8 h-8 mx-auto mb-2 border-2 border-gray-600 border-t-indigo-500 rounded-full animate-spin" />
        <p className="text-sm">Loading...</p>
      </div>
    </div>
  );

  // Error boundary
  const ErrorFallback = ({ message }: { message: string }) => (
    <div className="w-full h-full flex items-center justify-center text-gray-500">
      <div className="text-center">
        <ExclamationTriangleIcon className="w-12 h-12 mb-4 text-red-500 mx-auto" />
        <p className="text-sm font-semibold text-red-400">{message}</p>
      </div>
    </div>
  );

  try {
    switch (file.fileType) {
      case 'note':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <MarkdownEditor pane={pane} file={file} />
          </Suspense>
        );

      case 'pdf':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <PDFViewer file={file} />
          </Suspense>
        );

      case 'image':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <ImageViewer file={file} />
          </Suspense>
        );

      case 'video':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <VideoViewer file={file} />
          </Suspense>
        );

      default:
        return <ErrorFallback message={`Unsupported file type: ${file.fileType}`} />;
    }
  } catch (error) {
    return (
      <ErrorFallback message={error instanceof Error ? error.message : 'Failed to load file'} />
    );
  }
};

export default FileRenderer;
