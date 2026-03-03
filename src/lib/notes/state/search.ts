// extracted from Notea (MIT License)
import { create } from 'zustand';
import { NoteCacheItem } from '@/lib/notes/cache';
import { NOTE_DELETED } from '@/lib/notes/types/meta';
import { searchNote } from '../utils/search';

interface SearchState {
    list?: NoteCacheItem[];
    keyword: string;
    setKeyword: (keyword: string) => void;
    filterNotes: (searchKeyword?: string) => Promise<NoteCacheItem[]>;
}

export const useSearchStore = create<SearchState>((set, get) => ({
    list: undefined,
    keyword: '',
    setKeyword: (keyword) => set({ keyword }),
    filterNotes: async (searchKeyword?: string) => {
        const { keyword } = get();
        const kw = searchKeyword !== undefined ? searchKeyword : keyword;
        const results = kw ? await searchNote(kw, NOTE_DELETED.NORMAL) : [];
        set({ list: results });
        return results;
    },
}));

export default useSearchStore;
