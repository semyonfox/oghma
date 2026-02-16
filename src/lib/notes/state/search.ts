// extracted from Notea (MIT License)
import { useState, useCallback } from 'react';
import { createContainer } from 'unstated-next';
import { NoteCacheItem } from '@/lib/notes/cache';
import { NOTE_DELETED } from '@/lib/notes/types/meta';
import { searchNote } from '../utils/search';

function useSearch() {
    const [list, setList] = useState<NoteCacheItem[]>();
    const [keyword, setKeyword] = useState<string>('');
    
    const filterNotes = useCallback(async (searchKeyword?: string) => {
        const kw = searchKeyword !== undefined ? searchKeyword : keyword;
        setList(kw ? await searchNote(kw, NOTE_DELETED.NORMAL) : []);
        return kw ? await searchNote(kw, NOTE_DELETED.NORMAL) : [];
    }, [keyword]);

    return { list, keyword, setKeyword, filterNotes };
}

const SearchState = createContainer(useSearch);

export default SearchState;
