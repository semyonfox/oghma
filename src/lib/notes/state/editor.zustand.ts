import { useCallback, useState } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { debounce } from '@/lib/notes/utils/debounce';
import { searchNote, searchRangeText } from '@/lib/notes/utils/search';
import { LexicalEditorRef } from '@/components/editor/lexical-editor';
import { ROOT_ID } from '@/lib/notes/types/tree';
import { NoteModel, isNoteLink } from '@/lib/notes/types/note';
import useFetcher from '@/lib/notes/api/fetcher';
import { NOTE_DELETED } from '@/lib/notes/types/meta';

interface EditorState {
    note?: NoteModel;
    backlinks?: any[];
    editorEl: React.MutableRefObject<LexicalEditorRef | null>;
    onCreateLink: (title: string) => Promise<string>;
    onSearchLink: (keyword: string) => Promise<any[]>;
    onClickLink: (href: string) => void;
    onUploadImage: (file: File, id?: string) => Promise<string>;
    onHoverLink: (event: MouseEvent | React.MouseEvent) => void;
    getBackLinks: () => Promise<any[]>;
    onEditorChange: (value: () => string) => void;
    onNoteChange: (data: Partial<NoteModel>) => Promise<void>;
    saveNow: () => Promise<void>;
}

const useEditorStore = create<EditorState>()(
    persist(
        (set, get) => ({
            note: undefined,
            backlinks: [],
            editorEl: { current: null } as React.MutableRefObject<LexicalEditorRef | null>,
            // Note creation
            onCreateLink: async (title) => {
                try {
                    const res = await fetch('/api/notes', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title }),
                    });
                    if (!res.ok) return '';
                    const note = await res.json();
                    return `/${note.note_id}`;
                } catch {
                    return '';
                }
            },
            onSearchLink: async (keyword) => {
                const list = await searchNote(keyword, NOTE_DELETED.NORMAL);
                return list.map((item) => ({
                    title: item.title,
                    subtitle: searchRangeText({
                        text: item.rawContent || '',
                        keyword,
                        maxLen: 40,
                    }).match,
                    url: `/${item.id}`,
                }));
            },
            onClickLink: (href) => {
                if (isNoteLink(href.replace(location.origin, ''))) {
                    console.log('Navigate'); // Assume Zustand handles router use
                } else {
                    window.open(href, '_blank');
                }
            },
            onUploadImage: async (file, id) => {
                const data = new FormData();
                data.append('file', file);
                const response = await fetch(`/api/upload?id=${id}`, {
                    method: 'POST',
                    body: data,
                });
                if (!response.ok) {
                    throw new Error('Upload failed');
                }
                const result = await response.json();
                return result.url as string;
            },
            onHoverLink: () => {
                console.log('Handle hover logic');
            },
            getBackLinks: async () => {
                console.log('Retrieve backlinks');
                return [];
            },
            onEditorChange: (getValue) => {
                // TODO: Implement content change handler to sync with NoteState
                // This will be called when editor content changes
                // Should update the note content in the store
                const content = getValue();
                set((state) => ({
                    note: state.note ? { ...state.note, content } : undefined,
                }));
            },
            onNoteChange: debounce(async (data: Partial<NoteModel>) => {
                const note = get().note;
                if (!note?.id) return;

                // update local state
                set((state) => ({
                    note: state.note ? { ...state.note, ...data } : undefined,
                }));

                // persist to server (S3) via API
                try {
                    await fetch(`/api/notes/${note.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data),
                    });
                } catch (error) {
                    console.error('Failed to save note changes:', error);
                }
            }, 500) as unknown as (data: Partial<NoteModel>) => Promise<void>,
            saveNow: async () => {
                const note = get().note;
                if (!note?.id) return;

                try {
                    await fetch(`/api/notes/${note.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ content: note.content }),
                    });
                } catch (error) {
                    console.error('Failed to save note:', error);
                }
            },
        }),
        {
            name: 'editor-store',
            storage: createJSONStorage(() => sessionStorage),
            // editorEl is a React ref — cannot be serialized
            partialize: ({ editorEl: _editorEl, ...rest }) => rest,
        }
    )
);

export default useEditorStore;
