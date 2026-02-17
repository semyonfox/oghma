import { useCallback, useState } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { debounce } from 'lodash';
import { searchNote, searchRangeText } from '@/lib/notes/utils/search';
import { LexicalEditorRef } from '@/components/editor/lexical-editor';
import { ROOT_ID } from '@/lib/notes/types/tree';
import { NoteModel, isNoteLink } from '@/lib/notes/types/note';
import useFetcher from '@/lib/notes/api/fetcher';
import { NOTE_DELETED } from '@/lib/notes/types/meta';
import { has } from 'lodash';

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
                // Placeholder logic for creating links
                throw new Error('Not implemented yet.');
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
                const { request } = useFetcher();
                const data = new FormData();
                data.append('file', file);
                const result = await request<FormData, { url: string }>(
                    {
                        method: 'POST',
                        url: `/api/upload?id=${id}`,
                    },
                    data
                );
                if (!result) throw new Error('Upload failed');
                return result.url;
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
                // TODO: Implement auto-save to backend/cache
                // For now, just update the store
                set((state) => ({
                    note: state.note ? { ...state.note, ...data } : undefined,
                }));
                console.log('Note changes queued for save:', data);
            }, 500) as unknown as (data: Partial<NoteModel>) => Promise<void>,
            saveNow: async () => {
                // TODO: Implement immediate save (bypass debounce)
                // Should flush pending changes to backend/cache
                console.log('Saving note immediately');
            },
        }),
        {
            name: 'editor-store',
            storage: createJSONStorage(() => sessionStorage),
        }
    )
);

export default useEditorStore;