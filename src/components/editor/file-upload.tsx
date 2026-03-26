'use client';

import { FC, useState, useRef, useCallback } from 'react';
import { CloudArrowUpIcon, XMarkIcon } from '@heroicons/react/24/outline';
import useI18n from '@/lib/notes/hooks/use-i18n';

interface FileUploadProps {
  noteId: string;
  onUploadComplete?: (file: {
    fileName: string;
    path: string;
    url: string;
    size: number;
    type: string;
  }) => void;
  onError?: (error: string) => void;
}

/**
 * File upload component with drag-drop support
 * Displays modal dialog for uploading files to a note
 */
const FileUpload: FC<FileUploadProps> = ({ noteId, onUploadComplete, onError }) => {
   const { t } = useI18n();
   const [isOpen, setIsOpen] = useState(false);
   const [isDragging, setIsDragging] = useState(false);
   const [isUploading, setIsUploading] = useState(false);
   const [uploadProgress, setUploadProgress] = useState(0);
   const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(
    async (file: File) => {
      if (!file) return;

      setIsUploading(true);
      setUploadProgress(0);

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('noteId', noteId);

        const xhr = new XMLHttpRequest();

        // Track upload progress
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(percentComplete);
          }
        });

        // Handle completion
        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            const response = JSON.parse(xhr.responseText);
            setIsUploading(false);
            setUploadProgress(0);
            setIsOpen(false);

            onUploadComplete?.(response);
       } else {
             const response = JSON.parse(xhr.responseText);
             onError?.(response.error || t('file_upload.error_failed'));
             setIsUploading(false);
           }
         });

         xhr.addEventListener('error', () => {
           onError?.(t('file_upload.error_network'));
           setIsUploading(false);
         });

        xhr.open('POST', '/api/upload', true);
        xhr.send(formData);
       } catch (error) {
         onError?.(error instanceof Error ? error.message : t('file_upload.error_failed'));
         setIsUploading(false);
       }
    },
    [noteId, onUploadComplete, onError, t]
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleUpload(files[0]);
    }
  }, [handleUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleUpload(files[0]);
    }
  }, [handleUpload]);

  const handleClickUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

   if (!isOpen) {
     return (
       <button
         onClick={() => setIsOpen(true)}
         className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-gray-200 hover:bg-white/5 rounded transition-colors"
         title={t('file_upload.title_tooltip')}
       >
         <CloudArrowUpIcon className="w-4 h-4" />
         {t('file_upload.button_upload')}
       </button>
     );
   }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" role="dialog" aria-labelledby="upload-title">
       <div className="bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
         {/* Header */}
         <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
           <h2 id="upload-title" className="text-lg font-semibold text-white">{t('file_upload.dialog_title')}</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 hover:bg-white/10 rounded text-gray-500 hover:text-gray-300 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
         {isUploading ? (
             <div className="space-y-4">
               <p className="text-sm text-gray-300">{t('file_upload.uploading')}</p>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 text-center">{uploadProgress}%</p>
            </div>
          ) : (
            <div
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragging
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-gray-600 hover:border-gray-500'
              }`}
             >
               <CloudArrowUpIcon className="w-12 h-12 mx-auto mb-4 text-gray-500" />
               <p className="text-sm font-medium text-gray-300 mb-2">{t('file_upload.drag_drop')}</p>
               <p className="text-xs text-gray-500 mb-4">{t('file_upload.or_separator')}</p>
               <button
                 onClick={handleClickUpload}
                 className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
               >
                 {t('Choose File')}
               </button>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                className="hidden"
                accept="*/*"
              />
            </div>
          )}
        </div>

        {/* Footer */}
         <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-2">
           <button
             onClick={() => setIsOpen(false)}
             disabled={isUploading}
             className="px-4 py-2 text-sm text-gray-300 hover:bg-white/10 rounded transition-colors disabled:opacity-50"
           >
             {t('Close')}
           </button>
         </div>
      </div>
    </div>
  );
};

export default FileUpload;
