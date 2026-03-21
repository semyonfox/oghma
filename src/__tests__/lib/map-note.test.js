import { describe, it, expect } from 'vitest';
import { mapNoteFromDB } from '@/lib/notes/utils/map-note.js';

const FULL_ROW = {
    note_id: 'note-uuid-1',
    title: 'Test Note',
    content: '# Hello',
    is_folder: false,
    s3_key: 'uploads/file.pdf',
    deleted: 0,
    shared: 0,
    pinned: 1,
    created_at: '2025-06-01T12:00:00Z',
    updated_at: '2025-06-02T14:30:00Z',
};

describe('mapNoteFromDB', () => {
    it('maps snake_case DB columns to camelCase properties', () => {
        const result = mapNoteFromDB(FULL_ROW);
        expect(result.id).toBe('note-uuid-1');
        expect(result.title).toBe('Test Note');
        expect(result.content).toBe('# Hello');
        expect(result.isFolder).toBe(false);
        expect(result.s3Key).toBe('uploads/file.pdf');
        expect(result.deleted).toBe(0);
        expect(result.shared).toBe(0);
        expect(result.pinned).toBe(1);
    });

    it('converts created_at and updated_at to ISO strings', () => {
        const result = mapNoteFromDB(FULL_ROW);
        expect(result.createdAt).toBe(new Date('2025-06-01T12:00:00Z').toISOString());
        expect(result.updatedAt).toBe(new Date('2025-06-02T14:30:00Z').toISOString());
    });

    it('sets editorsize to null', () => {
        const result = mapNoteFromDB(FULL_ROW);
        expect(result.editorsize).toBeNull();
    });

    it('handles missing timestamp fields', () => {
        const row = { ...FULL_ROW, created_at: null, updated_at: undefined };
        const result = mapNoteFromDB(row);
        expect(result.createdAt).toBeUndefined();
        expect(result.updatedAt).toBeUndefined();
    });

    it('handles folder rows', () => {
        const folderRow = { ...FULL_ROW, is_folder: true, content: null };
        const result = mapNoteFromDB(folderRow);
        expect(result.isFolder).toBe(true);
        expect(result.content).toBeNull();
    });
});
