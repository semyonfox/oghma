// Editor view mode state management
import { create } from 'zustand';
import { uiCache } from '../cache';

export type EditorMode = 'edit' | 'source' | 'preview' | 'split';

const EDITOR_MODE_KEY = 'editor-mode';
const DEFAULT_MODE: EditorMode = 'edit';

interface EditorModeState {
    mode: EditorMode;
    isInitialized: boolean;
    initMode: () => Promise<void>;
    setMode: (newMode: EditorMode) => Promise<void>;
    cycleMode: () => Promise<void>;
    toggleEditSource: () => Promise<void>;
}

const useEditorModeStore = create<EditorModeState>((set, get) => ({
    mode: DEFAULT_MODE,
    isInitialized: false,

    // initialize from cache
    initMode: async () => {
        const cached = await uiCache.getItem<EditorMode>(EDITOR_MODE_KEY);
        set({
            mode: cached || DEFAULT_MODE,
            isInitialized: true,
        });
    },

    // set mode and persist
    setMode: async (newMode: EditorMode) => {
        set({ mode: newMode });
        await uiCache.setItem(EDITOR_MODE_KEY, newMode);
    },

    // cycle through modes: edit -> source -> preview -> split -> edit
    cycleMode: async () => {
        const { mode, setMode } = get();
        const modes: EditorMode[] = ['edit', 'source', 'preview', 'split'];
        const currentIndex = modes.indexOf(mode);
        const nextIndex = (currentIndex + 1) % modes.length;
        await setMode(modes[nextIndex]);
    },

    // toggle between edit and source (quick switch)
    toggleEditSource: async () => {
        const { mode, setMode } = get();
        await setMode(mode === 'edit' ? 'source' : 'edit');
    },
}));

export default useEditorModeStore;
