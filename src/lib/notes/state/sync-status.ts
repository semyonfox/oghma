// tracks which notes have unsaved local changes (like git status)
// used to show accent colors on file tree items
import { create } from 'zustand';

export type SyncState = 'synced' | 'modified' | 'new';

interface SyncStatusState {
    // map of noteId -> sync state
    status: Record<string, SyncState>;
    markModified: (id: string) => void;
    markNew: (id: string) => void;
    markSynced: (id: string) => void;
    getStatus: (id: string) => SyncState;
}

const useSyncStatusStore = create<SyncStatusState>((set, get) => ({
    status: {},

    markModified: (id: string) => {
        set((state) => ({
            status: { ...state.status, [id]: 'modified' },
        }));
    },

    markNew: (id: string) => {
        set((state) => ({
            status: { ...state.status, [id]: 'new' },
        }));
    },

    markSynced: (id: string) => {
        set((state) => {
            const next = { ...state.status };
            delete next[id];
            return { status: next };
        });
    },

    getStatus: (id: string) => {
        return get().status[id] || 'synced';
    },
}));

export default useSyncStatusStore;
