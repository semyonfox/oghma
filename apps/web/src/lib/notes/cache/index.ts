// extracted from Notea (MIT License)
import { NoteModel } from '@/lib/notes/types/note';
import localforage from 'localforage';

export const uiCache = localforage.createInstance({
    name: 'socsboard-ui',
});

export const noteCacheInstance = localforage.createInstance({
    name: 'socsboard-notes',
});

export interface NoteCacheItem extends NoteModel {
    /**
     * remove markdown tag
     */
    rawContent?: string;

    linkIds?: string[];
}
