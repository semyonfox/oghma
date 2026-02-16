'use client';

import { useEffect } from 'react';
import EditorModeState from '@/lib/notes/state/editor-mode';
import useEditorStore from '@/lib/notes/state/editor.zustand';
import NoteState from '@/lib/notes/state/note';
import MainEditor from './main-editor';
import SourceEditor from './source-editor';
import PreviewRenderer from './preview-renderer';
import SplitView from './split-view';
import EditorModeToggle from './mode-toggle';

export default function ModeAwareEditor() {
  const { mode, initMode, isInitialized } = EditorModeState.useContainer();
  const { note } = NoteState.useContainer();
  const { onNoteChange } = useEditorStore();

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
      <div className="fixed top-4 sm:top-6 right-6 md:right-8 z-50 bg-gray-50 dark:bg-gray-800 rounded-md shadow-md border border-gray-200 dark:border-gray-700">
        <EditorModeToggle />
      </div>
      
      {
        {
          edit: <MainEditor note={note} />,
          source: <SourceEditor content={content} onContentChange={handleContentChange} />,
          preview: <PreviewRenderer content={content} />,
          split: <SplitView content={content} onContentChange={handleContentChange} />,
        }[mode]
      }
    </div>
  );
}
