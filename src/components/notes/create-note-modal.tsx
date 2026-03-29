'use client';

import { FC, useState, useCallback, useRef } from 'react';
import { XMarkIcon, CloudArrowUpIcon } from '@heroicons/react/24/outline';
import useI18n from '@/lib/notes/hooks/use-i18n';

interface CreateNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateNote: (title: string, language: string) => Promise<void>;
  onCreateFolder: () => Promise<void>;
  onUploadFile: (file: File) => Promise<void>;
}

/**
 * Modal for creating new notes with drag-drop file upload or new markdown file creation
 */
const CreateNoteModal: FC<CreateNoteModalProps> = ({
  isOpen,
  onClose,
  onCreateNote,
  onCreateFolder,
  onUploadFile,
}) => {
  const { t } = useI18n();
  const [mode, setMode] = useState<'upload' | 'new' | 'folder'>('new');
  const [isDragging, setIsDragging] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        setIsCreating(true);
        try {
          await onUploadFile(files[0]);
          onClose();
        } catch (error) {
          console.error('Upload failed:', error);
        } finally {
          setIsCreating(false);
        }
      }
    },
    [onUploadFile, onClose]
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        setIsCreating(true);
        try {
          await onUploadFile(files[0]);
          onClose();
        } catch (error) {
          console.error('Upload failed:', error);
        } finally {
          setIsCreating(false);
        }
      }
    },
    [onUploadFile, onClose]
  );

  const handleClickUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleCreateNew = useCallback(async () => {
    setIsCreating(true);
    try {
      await onCreateNote('Untitled.md', 'markdown');
      onClose();
    } catch (error) {
      console.error('Create failed:', error);
    } finally {
      setIsCreating(false);
    }
  }, [onCreateNote, onClose]);

  const handleCreateFolder = useCallback(async () => {
    setIsCreating(true);
    try {
      await onCreateFolder();
      onClose();
    } catch (error) {
      console.error('Folder creation failed:', error);
    } finally {
      setIsCreating(false);
    }
  }, [onCreateFolder, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-labelledby="create-note-title"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-xl shadow-2xl ring-1 ring-white/[0.08] max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
         <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
           <h2
             id="create-note-title"
             className="text-base font-semibold text-text"
           >
             {t('Create Note')}
           </h2>
          <button
            onClick={onClose}
            disabled={isCreating}
            className="p-1 hover:bg-white/[0.06] rounded text-text-tertiary hover:text-text-secondary transition-colors disabled:opacity-50"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Mode Tabs */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setMode('new')}
              disabled={isCreating}
             className={`flex-1 px-4 py-2 rounded font-medium text-sm transition-colors ${
                 mode === 'new'
                   ? 'bg-primary-600 text-text-on-primary'
                   : 'bg-surface-elevated/50 text-text-secondary hover:bg-surface-elevated'
               } disabled:opacity-50`}
             >
               {t('File')}
             </button>
             <button
               onClick={() => setMode('folder')}
               disabled={isCreating}
               className={`flex-1 px-4 py-2 rounded font-medium text-sm transition-colors ${
                 mode === 'folder'
                   ? 'bg-primary-600 text-text-on-primary'
                   : 'bg-surface-elevated/50 text-text-secondary hover:bg-surface-elevated'
               } disabled:opacity-50`}
             >
               {t('Folder')}
             </button>
             <button
               onClick={() => setMode('upload')}
               disabled={isCreating}
               className={`flex-1 px-4 py-2 rounded font-medium text-sm transition-colors ${
                 mode === 'upload'
                   ? 'bg-primary-600 text-text-on-primary'
                   : 'bg-surface-elevated/50 text-text-secondary hover:bg-surface-elevated'
               } disabled:opacity-50`}
             >
               {t('Upload')}
             </button>
          </div>

          {/* New File Mode */}
           {mode === 'new' && (
             <div className="space-y-4">
               <p className="text-sm text-text-tertiary">
                 {t('Create a new markdown file')}
               </p>
             </div>
           )}

           {/* New Folder Mode */}
           {mode === 'folder' && (
             <div className="space-y-4">
               <p className="text-sm text-text-tertiary">
                 {t('Create a new folder to organize your notes')}
               </p>
             </div>
           )}

          {/* Upload Mode */}
          {mode === 'upload' && (
            <div
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragging
                  ? 'border-primary-500 bg-primary-500/10'
                  : 'border-border hover:border-text-tertiary'
              }`}
            >
               <CloudArrowUpIcon className="w-10 h-10 mx-auto mb-3 text-text-tertiary opacity-50" />
               <p className="text-sm font-medium text-text-secondary mb-2">
                 {t('Drag and drop your file')}
               </p>
               <p className="text-xs text-text-tertiary mb-4">{t('or')}</p>
               <button
                 onClick={handleClickUpload}
                 disabled={isCreating}
                 className="inline-block px-4 py-2 bg-primary-600 hover:bg-primary-700 text-text-on-primary text-sm rounded transition-colors disabled:opacity-50"
               >
                 {t('Choose File')}
               </button>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          )}
        </div>

         {/* Footer */}
         <div className="px-6 py-4 border-t border-border-subtle flex justify-end gap-2">
           <button
             onClick={onClose}
             disabled={isCreating}
             className="px-4 py-2 text-sm text-text-secondary hover:bg-white/[0.06] rounded transition-colors disabled:opacity-50"
           >
             {t('Close')}
           </button>
           {mode === 'new' && (
             <button
               onClick={handleCreateNew}
               disabled={isCreating}
               className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-text-on-primary rounded transition-colors disabled:opacity-50"
             >
               {isCreating ? t('Creating...') : t('Create')}
             </button>
           )}
           {mode === 'folder' && (
             <button
               onClick={handleCreateFolder}
               disabled={isCreating}
               className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-text-on-primary rounded transition-colors disabled:opacity-50"
             >
               {isCreating ? t('Creating...') : t('Create')}
             </button>
           )}
         </div>
      </div>
    </div>
  );
};

export default CreateNoteModal;

