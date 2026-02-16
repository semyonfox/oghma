'use client';

import { useEffect } from 'react';
import EditorModeState from '@/lib/notes/state/editor-mode';
import EditorState from '@/lib/notes/state/editor';
import NoteState from '@/lib/notes/state/note';
import MainEditor from './main-editor';
import SourceEditor from './source-editor';
import PreviewRenderer from './preview-renderer';
import SplitView from './split-view';
import EditorModeToggle from './mode-toggle';

export default function ModeAwareEditor() {
  const { mode, initMode, isInitialized } = EditorModeState.useContainer();
  const { note } = NoteState.useContainer();
  const { onNoteChange } = EditorState.useContainer();

  // initialize mode from cache on mount
  useEffect(() => {
    if (!isInitialized) {
      initMode();
    }
  }, [initMode, isInitialized]);

  const handleContentChange = (newContent: string) => {
    onNoteChange({ content: newContent });
  };

  const content = note?.content || '';

  // render mode toggle in fixed position
  // Removed renderModeToggle; embedded EditorModeToggle directly in JSX

  if (!isInitialized) {
    return null; // or a loading spinner
  }

  return (
    <div className="h-full relative">
      <div className="fixed top-4 right-6 z-50 bg-surface dark:bg-neutral-800 rounded-lg shadow-lg border border-border dark:border-neutral-700">
        <EditorModeToggle />
      </div>
      
      {mode === 'edit' && (
        <MainEditor note={note} />
      )}
      
      {mode === 'source' && (
        <SourceEditor 
          content={content}
          onContentChange={handleContentChange}
        />
      )}
      
      {mode === 'preview' && (
        <PreviewRenderer content={content} />
      )}
      
      {mode === 'split' && (
        <SplitView 
          content={content}
          onContentChange={handleContentChange}
        />
      )}
    </div>
  );
}
