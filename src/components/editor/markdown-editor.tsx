'use client';

import { FC, useState, useCallback, useEffect, useMemo } from 'react';
import { FileSpec } from '@/lib/notes/state/layout.zustand';
import NoteState from '@/lib/notes/state/note';
import LexicalEditor from './lexical-editor';
import PreviewRenderer from './preview-renderer';

interface MarkdownEditorProps {
  pane: 'A' | 'B';
  file: FileSpec;
}

/**
 * Full-pane Markdown editor with simple edit/preview toggle
 * Works in both panes, handles typing normally
 */
const MarkdownEditor: FC<MarkdownEditorProps> = ({ pane, file }) => {
  const [editMode, setEditMode] = useState(true); // Default to edit mode
  const [content, setContent] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { note, fetchNote } = NoteState.useContainer();

  // Load note content
  useEffect(() => {
    if (file.fileId) {
      fetchNote(file.fileId).catch(console.error);
    }
  }, [file.fileId, fetchNote]);

  const currentContent = useMemo(
    () => (isDirty ? content : (note?.content ?? '')),
    [content, isDirty, note?.content]
  );

  // Handle content changes during typing
  const handleContentChange = useCallback(
    (getContent: () => string) => {
      const newContent = getContent();
      setContent(newContent);
      setIsDirty(true);
    },
    []
  );

  // Handle save with Ctrl+S
  const handleSave = useCallback(async () => {
    if (isDirty && file.fileId && content !== note?.content) {
      setIsSaving(true);

      try {
        // TODO: Call API to save note to S3
        await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate save
        setIsDirty(false);
      } catch (error) {
        console.error('Save failed:', error);
        setIsDirty(true);
      } finally {
        setIsSaving(false);
      }
    }
  }, [content, note?.content, file.fileId, isDirty]);

  // Global Ctrl+S handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Simple Toolbar */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-white/10 flex items-center justify-between">
        {/* Simple Edit/Preview Toggle */}
        <div className="flex items-center gap-1 bg-white/5 p-1 rounded">
          <button
            onClick={() => setEditMode(true)}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              editMode
                ? 'bg-indigo-500 text-white'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Edit
          </button>
          <button
            onClick={() => setEditMode(false)}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              !editMode
                ? 'bg-indigo-500 text-white'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Preview
          </button>
        </div>

        {/* Save Status */}
        <span
          className={`text-xs font-mono ${
            isSaving || isDirty ? 'text-yellow-500' : 'text-green-500'
          }`}
        >
          {isSaving && '⟳ Saving...'}
          {!isSaving && isDirty && '● Unsaved (Ctrl+S)'}
          {!isSaving && !isDirty && '✓ Saved'}
        </span>
      </div>

      {/* Full-Pane Content Area */}
      {editMode ? (
        // Edit Mode - Full pane editor
        <div className="flex-1 overflow-auto">
            <LexicalEditor
              id={file.fileId}
              value={currentContent}
              onChange={handleContentChange}
              readOnly={false}
            />
        </div>
      ) : (
        // Preview Mode - Full pane preview
        <div className="flex-1 overflow-auto bg-gray-950">
          <div className="max-w-4xl mx-auto px-6 py-8">
            <PreviewRenderer content={currentContent} />
          </div>
        </div>
      )}
    </div>
  );
};

export default MarkdownEditor;
