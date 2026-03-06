// extracted from Notea (MIT License)

import { EDITOR_SIZE, NOTE_DELETED, NOTE_PINNED, NOTE_SHARED } from './meta';

export interface NoteModel {
    id: string; // UUID v7 format
    title: string;
    /**
     * Parent ID (UUID v7)
     */
    pid?: string;
    content?: string;
    pic?: string;
    date?: string;
    deleted: NOTE_DELETED;
    shared: NOTE_SHARED;
    pinned: NOTE_PINNED;
    editorsize: EDITOR_SIZE | null;
}

/**
 * UUID v7 format: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
 * like `/550e8400-e29b-41d4-a716-446655440000`
 */
export const isNoteLink = (str: string) => {
    return new RegExp(`^/${NOTE_ID_REGEXP}$`).test(str);
};

// UUID v7 pattern: 8-4-4-4-12 hex digits with hyphens
export const NOTE_ID_REGEXP = '[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
