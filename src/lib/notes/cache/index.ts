// extracted from Notea (MIT License)
import { NoteModel } from '@/lib/notes/types/note';
import localforage from 'localforage';

export const uiCache = localforage.createInstance({
    name: 'oghma-ui',
});

export const noteCacheInstance = localforage.createInstance({
    name: 'oghma-notes',
});

export interface NoteCacheItem extends NoteModel {
    /**
     * remove markdown tag
     */
    rawContent?: string;

    linkIds?: string[];
}
