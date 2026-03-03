'use client';

import { FC, useState, useCallback, useRef } from 'react';
import { XMarkIcon, CloudArrowUpIcon } from '@heroicons/react/24/outline';

interface CreateNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateNote: (title: string, language: string) => Promise<void>;
  onUploadFile: (file: File) => Promise<void>;
}

/**
 * Modal for creating new notes with drag-drop file upload or new markdown file creation
 */
const CreateNoteModal: FC<CreateNoteModalProps> = ({
  isOpen,
  onClose,
  onCreateNote,
  onUploadFile,
}) => {
  const [mode, setMode] = useState<'upload' | 'new'>('new');
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

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      role="dialog"
      aria-labelledby="create-note-title"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2
            id="create-note-title"
            className="text-lg font-semibold text-white"
          >
            Create Note
          </h2>
          <button
            onClick={onClose}
            disabled={isCreating}
            className="p-1 hover:bg-white/10 rounded text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-50"
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
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              } disabled:opacity-50`}
            >
              New File
            </button>
            <button
              onClick={() => setMode('upload')}
              disabled={isCreating}
              className={`flex-1 px-4 py-2 rounded font-medium text-sm transition-colors ${
                mode === 'upload'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              } disabled:opacity-50`}
            >
              Upload
            </button>
          </div>

          {/* New File Mode */}
          {mode === 'new' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                Create a new markdown file (.md)
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
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-gray-600 hover:border-gray-500'
              }`}
            >
              <CloudArrowUpIcon className="w-12 h-12 mx-auto mb-4 text-gray-500" />
              <p className="text-sm font-medium text-gray-300 mb-2">
                Drag and drop your file
              </p>
              <p className="text-xs text-gray-500 mb-4">or</p>
              <button
                onClick={handleClickUpload}
                disabled={isCreating}
                className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors disabled:opacity-50"
              >
                Choose File
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
        <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={isCreating}
            className="px-4 py-2 text-sm text-gray-300 hover:bg-white/10 rounded transition-colors disabled:opacity-50"
          >
            Close
          </button>
          {mode === 'new' && (
            <button
              onClick={handleCreateNew}
              disabled={isCreating}
              className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors disabled:opacity-50"
            >
              {isCreating ? 'Creating...' : 'Create'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateNoteModal;

