'use client';

import { FC, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { FileSpec } from '@/lib/notes/state/layout.zustand';
import useNoteStore from '@/lib/notes/state/note';
import useSyncStatusStore from '@/lib/notes/state/sync-status';
import PreviewRenderer from './preview-renderer';
import Link from 'next/link';

type EditorMode = 'source' | 'read';

interface MarkdownEditorProps {
  pane: 'A' | 'B';
  file: FileSpec;
}

/**
 * Markdown editor with Source (raw md) and Read (rendered preview) modes
 */
const MarkdownEditor: FC<MarkdownEditorProps> = ({ pane, file }) => {
  const [mode, setMode] = useState<EditorMode>('source');
  const [localContent, setLocalContent] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { note, fetchNote, mutateNote } = useNoteStore();
  const { markModified, markSynced } = useSyncStatusStore();
  const currentFileId = useRef(file.fileId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // load note content when file changes
  useEffect(() => {
    if (!file.fileId) return;
    currentFileId.current = file.fileId;
    setLoaded(false);
    setIsDirty(false);

    fetchNote(file.fileId)
      .then((result) => {
        if (result && currentFileId.current === file.fileId) {
          setLocalContent(result.content ?? '');
          setLoaded(true);
        }
      })
      .catch(console.error);
  }, [file.fileId, fetchNote]);

  // pick up content from store when note loads from cache
  useEffect(() => {
    if (note && note.id === file.fileId && !isDirty && !loaded) {
      setLocalContent(note.content ?? '');
      setLoaded(true);
    }
  }, [note, file.fileId, isDirty, loaded]);

  const displayContent = useMemo(
    () => (loaded ? localContent : ''),
    [localContent, loaded]
  );

  // track dirty state in sync status store
  useEffect(() => {
    if (isDirty && file.fileId) {
      markModified(file.fileId);
    }
  }, [isDirty, file.fileId, markModified]);

  // save via API
  const handleSave = useCallback(async () => {
    if (!isDirty || !file.fileId) return;

    setIsSaving(true);
    try {
      await mutateNote(file.fileId, { content: localContent });
      setIsDirty(false);
      markSynced(file.fileId);
    } catch (error) {
      console.error('Save failed:', error);
    } finally {
      setIsSaving(false);
    }
  }, [localContent, file.fileId, isDirty, mutateNote, markSynced]);

  // Ctrl+S handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  // handle special keys in textarea
  const handleTextareaKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;

    if (e.key === 'Tab') {
      e.preventDefault();
      const newValue = value.substring(0, start) + '  ' + value.substring(end);
      setLocalContent(newValue);
      setIsDirty(true);
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      });
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const currentLine = value.substring(lineStart, start);

      // detect list continuation patterns
      // unordered: - , * , + 
      const unorderedMatch = currentLine.match(/^(\s*)([-*+])\s/);
      // ordered: 1. 2. etc
      const orderedMatch = currentLine.match(/^(\s*)(\d+)\.\s/);
      // checkbox: - [ ] or - [x]
      const checkboxMatch = currentLine.match(/^(\s*)([-*+])\s\[[ x]\]\s/);
      // blockquote: > 
      const quoteMatch = currentLine.match(/^(\s*)(>+)\s?/);

      let insert = '\n';

      // if line is empty list item, end the list instead of continuing
      const trimmedLine = currentLine.trimStart();
      const isEmptyListItem = /^([-*+]|\d+\.)\s*$/.test(trimmedLine) ||
                               /^([-*+])\s\[[ x]\]\s*$/.test(trimmedLine);

      if (isEmptyListItem) {
        // clear the current empty list item and just add a newline
        const newValue = value.substring(0, lineStart) + '\n' + value.substring(end);
        setLocalContent(newValue);
        setIsDirty(true);
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = lineStart + 1;
        });
        return;
      }

      if (checkboxMatch) {
        insert = '\n' + checkboxMatch[1] + checkboxMatch[2] + ' [ ] ';
      } else if (unorderedMatch) {
        insert = '\n' + unorderedMatch[1] + unorderedMatch[2] + ' ';
      } else if (orderedMatch) {
        const nextNum = parseInt(orderedMatch[2], 10) + 1;
        insert = '\n' + orderedMatch[1] + nextNum + '. ';
      } else if (quoteMatch) {
        insert = '\n' + quoteMatch[1] + quoteMatch[2] + ' ';
      }

      const newValue = value.substring(0, start) + insert + value.substring(end);
      setLocalContent(newValue);
      setIsDirty(true);

      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + insert.length;
      });
    }
  }, []);

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Toolbar */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-white/10 flex items-center justify-between">
        {/* Source / Read toggle */}
        <div className="flex items-center gap-1 bg-white/5 p-1 rounded">
          <button
            onClick={() => setMode('source')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              mode === 'source'
                ? 'bg-indigo-500 text-white'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Source
          </button>
          <button
            onClick={() => setMode('read')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              mode === 'read'
                ? 'bg-indigo-500 text-white'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Read
          </button>
        </div>

        {/* Save Status + Guide link */}
        <div className="flex items-center gap-3">
          <Link
            href="/syntax-guide"
            target="_blank"
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Syntax Guide
          </Link>
          <span
            className={`text-xs font-mono ${
              isSaving || isDirty ? 'text-yellow-500' : 'text-green-500'
            }`}
          >
            {isSaving && 'Saving...'}
            {!isSaving && isDirty && 'Unsaved (Ctrl+S)'}
            {!isSaving && !isDirty && 'Saved'}
          </span>
        </div>
      </div>

       {/* Content Area - Same background for both modes */}
       <div className="flex-1 overflow-auto flex flex-col items-center bg-gray-800">
         {mode === 'source' ? (
           loaded ? (
             <div className="w-full max-w-5xl h-full">
               {/* Centered editor with same inset as read mode */}
               <textarea
                 ref={textareaRef}
                 value={displayContent}
                 onChange={(e) => {
                   setLocalContent(e.target.value);
                   setIsDirty(true);
                 }}
                 onKeyDown={handleTextareaKeyDown}
                 spellCheck={false}
                 className="w-full h-full bg-gray-800 text-gray-200 font-mono text-sm leading-relaxed px-12 py-8 outline-none resize-none"
                 placeholder="Start writing..."
               />
             </div>
           ) : (
             <div className="flex items-center justify-center h-full text-gray-500 text-sm">
               Loading...
             </div>
           )
         ) : (
           loaded ? (
             <div className="w-full max-w-5xl h-full bg-gray-800">
               {/* Centered rendered view with same styling */}
               <div className="px-12 py-8 prose prose-invert h-full bg-gray-800 text-gray-200">
                 <PreviewRenderer content={displayContent} />
               </div>
             </div>
           ) : (
             <div className="flex items-center justify-center h-full text-gray-500 text-sm">
               Loading...
             </div>
           )
         )}
       </div>
    </div>
  );
};

export default MarkdownEditor;
