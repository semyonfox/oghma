// Editor view mode state management
import { useState, useCallback } from 'react';
import { createContainer } from 'unstated-next';
import { uiCache } from '../cache';

export type EditorMode = 'edit' | 'source' | 'preview' | 'split';

const EDITOR_MODE_KEY = 'editor-mode';
const DEFAULT_MODE: EditorMode = 'edit';

function useEditorMode() {
  const [mode, setModeState] = useState<EditorMode>(DEFAULT_MODE);
  const [isInitialized, setIsInitialized] = useState(false);

  // initialize from cache
  const initMode = useCallback(async () => {
    const cached = await uiCache.getItem<EditorMode>(EDITOR_MODE_KEY);
    if (cached) {
      setModeState(cached);
    }
    setIsInitialized(true);
  }, []);

  // set mode and persist
  const setMode = useCallback(async (newMode: EditorMode) => {
    setModeState(newMode);
    await uiCache.setItem(EDITOR_MODE_KEY, newMode);
  }, []);

  // cycle through modes: edit -> source -> preview -> split -> edit
  const cycleMode = useCallback(async () => {
    const modes: EditorMode[] = ['edit', 'source', 'preview', 'split'];
    const currentIndex = modes.indexOf(mode);
    const nextIndex = (currentIndex + 1) % modes.length;
    await setMode(modes[nextIndex]);
  }, [mode, setMode]);

  // toggle between edit and source (quick switch)
  const toggleEditSource = useCallback(async () => {
    await setMode(mode === 'edit' ? 'source' : 'edit');
  }, [mode, setMode]);

  return {
    mode,
    setMode,
    cycleMode,
    toggleEditSource,
    initMode,
    isInitialized,
  };
}

const EditorModeState = createContainer(useEditorMode);

export default EditorModeState;
