// extracted from Notea (MIT License)
import { create } from 'zustand';
import noteCache from '../cache/note';
import { NOTE_DELETED } from '@/lib/notes/types/meta';
import { NoteCacheItem } from '../cache';
import { searchNote } from '../utils/search';
import { NoteModel } from '@/lib/notes/types/note';
import { ROOT_ID } from '@/lib/notes/types/tree';

export interface TrashStoreState {
    keyword: string | undefined;
    list: NoteCacheItem[] | undefined;
    loading: boolean;
    // API instances for dependency injection
    trashAPI: any;
    treeStore: any;
    // Methods
    filterNotes: (keyword?: string) => Promise<void>;
    restoreNote: (note: NoteModel) => Promise<NoteModel>;
    deleteNote: (id: string) => Promise<void>;
    setDependencies: (trashAPI: any, treeStore: any) => void;
}

const useTrashStore = create<TrashStoreState>((set, get) => ({
    keyword: undefined,
    list: undefined,
    loading: false,
    trashAPI: null,
    treeStore: null,

    setDependencies: (trashAPI: any, treeStore: any) => {
        set({ trashAPI, treeStore });
    },

    filterNotes: async (keyword = '') => {
        const data = await searchNote(keyword, NOTE_DELETED.DELETED);

        set({
            keyword,
            list: data,
        });
    },

    restoreNote: async (note: NoteModel) => {
        const state = get();
        const { trashAPI, treeStore } = state;

        // Guard: trashAPI and treeStore must be initialized
        if (!trashAPI || !treeStore) {
            console.warn('trashAPI or treeStore not initialized yet');
            return note;
        }

        // 父页面被删除时，恢复页面的 parent 改成 root
        const pNote = note.pid && (await noteCache.getItem(note.pid));
        if (
            !note.pid ||
            !pNote ||
            pNote?.deleted === NOTE_DELETED.DELETED
        ) {
            note.pid = ROOT_ID;
        }

        await trashAPI.mutate({
            action: 'restore',
            data: {
                id: note.id,
                parentId: note.pid,
            },
        });
        await noteCache.mutateItem(note.id, {
            deleted: NOTE_DELETED.NORMAL,
        });
        await treeStore.getState().restoreItem(note.id, note.pid);

        return note;
    },

    deleteNote: async (id: string) => {
        const state = get();
        const { trashAPI, treeStore } = state;

        // Guard: trashAPI and treeStore must be initialized
        if (!trashAPI || !treeStore) {
            console.warn('trashAPI or treeStore not initialized yet');
            return;
        }

        await trashAPI.mutate({
            action: 'delete',
            data: {
                id,
            },
        });
        await noteCache.removeItem(id);
        await treeStore.getState().deleteItem(id);
    },
}));

export default useTrashStore;
