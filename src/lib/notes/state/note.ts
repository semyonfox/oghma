// extracted from Notea (MIT License)
import { create } from 'zustand';
import { NOTE_DELETED, NOTE_PINNED, NOTE_SHARED } from '@/lib/notes/types/meta';
import noteCache from '../cache/note';
import { NoteModel } from '@/lib/notes/types/note';
import useSyncStatusStore from './sync-status';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface NoteStoreState {
    note: NoteModel | undefined;
    loading: boolean;
    // API instances for dependency injection
    // treeStore is the zustand store hook itself (use .getState() to access methods)
    noteAPI: any;
    treeStore: any;
    toast: any;
    // Methods
    fetchNote: (id: string) => Promise<NoteModel | undefined>;
    removeNote: (id: string) => Promise<void>;
    mutateNote: (id: string, payload: Partial<NoteModel>) => Promise<void>;
    createNote: (body: Partial<NoteModel>) => Promise<NoteModel | undefined>;
    createNoteWithTitle: (title: NoteModel['title']) => Promise<{ id: string } | undefined>;
    updateNote: (data: Partial<NoteModel>) => Promise<void>;
    initNote: (note: Partial<NoteModel>) => void;
    findOrCreateNote: (id: string, note: Partial<NoteModel>) => Promise<void>;
    abortFindNote: () => void;
    setDependencies: (noteAPI: any, treeStore: any, toast: any) => void;
}

const useNoteStore = create<NoteStoreState>((set, get) => ({
    note: undefined,
    loading: false,
    noteAPI: null,
    treeStore: null,
    toast: null,

    setDependencies: (noteAPI: any, treeStore: any, toast: any) => {
        set({ noteAPI, treeStore, toast });
    },

    fetchNote: async (id: string) => {
        const state = get();
        const { noteAPI } = state;
        
        // Guard: noteAPI must be initialized
        if (!noteAPI) {
            console.warn('noteAPI not initialized yet');
            return undefined;
        }

        // Guard: reject stale nanoid IDs — server always returns 400 for them
        if (!UUID_RE.test(id)) {
            console.warn(`[noteStore] fetchNote: non-UUID id ${id} — evicting from cache`);
            await noteCache.removeItem(id);
            return undefined;
        }
        
        const cache = await noteCache.getItem(id);
        if (cache) {
            set({ note: cache });
        }
        const result = await noteAPI.find(id);

        if (!result) {
            return;
        }

        result.content = result.content || '\n';
        set({ note: result });
        await noteCache.setItem(id, result);

        return result;
    },

    removeNote: async (id: string) => {
        const state = get();
        const { noteAPI, treeStore } = state;

        // Guard: noteAPI and treeStore must be initialized
        if (!noteAPI || !treeStore) {
            console.warn('noteAPI or treeStore not initialized yet');
            return;
        }

        try {
            // Call DELETE endpoint (soft delete on server)
            await noteAPI.remove(id);
        } catch (error) {
            console.error('Error deleting note:', error);
            throw error;
        }
        
        // Remove from cache
        await noteCache.removeItem(id);
        
        // Remove from tree
        await treeStore.getState().removeItem(id);
        
         // Clear current note if it's the one being deleted
        if (state.note?.id === id) {
            set({ note: undefined });
        }
    },

    mutateNote: async (id: string, payload: Partial<NoteModel>) => {
        const state = get();
        const { noteAPI, treeStore } = state;
        
        // Guard: noteAPI must be initialized
        if (!noteAPI) {
            console.warn('noteAPI not initialized yet');
            return;
        }
        
        // try to get note from cache, fall back to store, fall back to fetching
        let note = await noteCache.getItem(id);
        if (!note && state.note?.id === id) {
            note = state.note;
            // populate cache so future mutations work
            if (note) await noteCache.setItem(id, note);
        }
        if (!note && noteAPI) {
            // last resort: fetch from API and cache it
            try {
                const fetched = await noteAPI.find(id);
                if (fetched) {
                    note = fetched;
                    await noteCache.setItem(id, fetched);
                }
            } catch {
                // ignore fetch errors, proceed with partial mutation
            }
        }

        // update local store state
        set((state) => ({
            note:
                state.note?.id === id
                    ? { ...state.note, ...payload }
                    : state.note,
        }));

        // send mutation to API (this is the S3 sync)
        await noteAPI.mutate(id, payload);

        // mark as synced after successful API save
        useSyncStatusStore.getState().markSynced(id);

        // update cache
        await noteCache.mutateItem(id, payload);

        // update tree (title changes show in sidebar)
        if (note) {
            await treeStore.getState().mutateItem(id, {
                data: {
                    ...note,
                    ...payload,
                },
            });
        }
    },

    createNote: async (body: Partial<NoteModel>) => {
        const state = get();
        const { noteAPI, treeStore, toast } = state;
        
        // Guard: dependencies must be initialized
        if (!noteAPI || !treeStore) {
            console.warn('noteAPI or treeStore not initialized yet');
            return;
        }
        
        const result = await noteAPI.create(body);

        if (!result) {
            toast(noteAPI.error, 'error');
            return;
        }

        result.content = result.content || '\n';
        await noteCache.setItem(result.id, result);
        set({ note: result });
        treeStore.getState().addItem(result);

        // mark as new in sync status (green accent in tree)
        useSyncStatusStore.getState().markNew(result.id);

        return result;
    },

    createNoteWithTitle: async (title: NoteModel['title']) => {
        const state = get();
        const { noteAPI, treeStore } = state;
        
        // Guard: dependencies must be initialized
        if (!noteAPI || !treeStore) {
            console.warn('noteAPI or treeStore not initialized yet');
            return;
        }
        
        const id = treeStore.getState().genNewId();
        const result = await noteAPI.create({
            id,
            title,
        });

        if (!result) {
            return;
        }

        result.content = result.content || '\n';
        await noteCache.setItem(result.id, result);
        treeStore.getState().addItem(result);

        return { id };
    },

    /**
     * TODO: merge with mutateNote
     */
    updateNote: async (data: Partial<NoteModel>) => {
        const state = get();
        const { noteAPI, treeStore, toast } = state;
        const currentNote = get().note;

        // Guard: noteAPI must be initialized
        if (!noteAPI) {
            console.warn('noteAPI not initialized yet');
            return;
        }

        noteAPI.abort();

        if (!currentNote?.id) {
            toast('Not found id', 'error');
            return;
        }
        const newNote = {
            ...currentNote,
            ...data,
        };
        delete newNote.content;
        set({ note: newNote });
        await treeStore.getState().mutateItem(newNote.id, {
            data: newNote,
        });
        await noteAPI.mutate(currentNote.id, data);
        await noteCache.mutateItem(currentNote.id, data);
    },

    initNote: (note: Partial<NoteModel>) => {
        set({
            note: {
                deleted: NOTE_DELETED.NORMAL,
                shared: NOTE_SHARED.PRIVATE,
                pinned: NOTE_PINNED.UNPINNED,
                editorsize: null,
                id: '-1',
                title: '',
                ...note,
            } as NoteModel,
        });
    },

    findOrCreateNote: async (id: string, note: Partial<NoteModel>) => {
        const fetchNote = get().fetchNote;
        const createNote = get().createNote;
        try {
            const data = await fetchNote(id);
            if (!data) {
                throw data;
            }
        } catch {
            await createNote({
                id,
                ...note,
            });
        }
    },

    abortFindNote: () => {
        const state = get();
        const { noteAPI } = state;
        // Guard: noteAPI must be initialized
        if (!noteAPI) return;
        noteAPI.abort();
    },
}));

export default useNoteStore;
