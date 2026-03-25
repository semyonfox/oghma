'use client';

import { FC, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { FileSpec } from '@/lib/notes/state/layout.zustand';
import MarkdownEditor from './markdown-editor';
import ImageViewer from './image-viewer';
import VideoViewer from './video-viewer';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import useI18n from '@/lib/notes/hooks/use-i18n';

// pdfjs-dist uses browser-only APIs (DOMMatrix) at module scope,
// so it must be excluded from SSR to avoid crashing in Node.js
const PDFViewer = dynamic(() => import('./pdf-viewer'), { ssr: false });

interface FileRendererProps {
  pane: 'A' | 'B';
  file: FileSpec;
}

/**
 * Dynamic file renderer
 * Routes to appropriate viewer based on file type
 */
const LoadingFallback = () => {
   const { t } = useI18n();
   return (
     <div className="w-full h-full flex items-center justify-center text-text-tertiary">
       <div className="text-center">
         <div className="w-8 h-8 mx-auto mb-2 border-2 border-border border-t-primary-500 rounded-full animate-spin" />
         <p className="text-sm">{t('Loading...')}</p>
       </div>
     </div>
   );
};

const ErrorFallback = ({ message }: { message: string }) => {
   const { t } = useI18n();
   return (
     <div className="w-full h-full flex items-center justify-center text-text-tertiary">
       <div className="text-center">
         <ExclamationTriangleIcon className="w-12 h-12 mb-4 text-red-500 mx-auto" />
         <p className="text-sm font-semibold text-red-400">{t(message)}</p>
       </div>
     </div>
   );
};

const FileRenderer: FC<FileRendererProps> = ({ pane, file }) => {
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
          <PDFViewer file={file} pane={pane} />
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
       return <ErrorFallback message="file_renderer.unsupported_type" />;
  }
};

export default FileRenderer;
