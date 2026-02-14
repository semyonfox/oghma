// extracted from Notea (MIT License)
import { useState, useCallback } from 'react';
import { createContainer } from 'unstated-next';
import { NoteCacheItem } from '@/lib/notes/cache';
import { NOTE_DELETED } from '@/lib/notes/types/meta';
import { searchNote } from '../utils/search';

function useSearch() {
    const [list, setList] = useState<NoteCacheItem[]>();
    const [keyword, setKeyword] = useState<string>();
    const filterNotes = useCallback(async (keyword?: string) => {
        setKeyword(keyword);
        setList(keyword ? await searchNote(keyword, NOTE_DELETED.NORMAL) : []);
    }, []);

    return { list, keyword, filterNotes };
}

const SearchState = createContainer(useSearch);

export default SearchState;
