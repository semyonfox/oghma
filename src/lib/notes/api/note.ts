// extracted from Notea (MIT License)
import { NoteModel } from '@/lib/notes/types/note';
import { useCallback } from 'react';
import noteCache from '../cache/note';
import useFetcher from './fetcher';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function useNoteAPI() {
    const { loading, request, abort, error } = useFetcher();

    const find = useCallback(
        async (id: string) => {
            return request<null, NoteModel>({
                method: 'GET',
                url: `/api/notes/${id}`,
            });
        },
        [request]
    );

    const create = useCallback(
        async (body: Partial<NoteModel>) => {
            return request<Partial<NoteModel>, NoteModel>(
                {
                    method: 'POST',
                    url: `/api/notes`,
                },
                body
            );
        },
        [request]
    );

    const mutate = useCallback(
        async (id: string, body: Partial<NoteModel>) => {
            return request<Partial<NoteModel>, NoteModel>(
                {
                    method: 'PUT',
                    url: `/api/notes/${id}`,
                },
                body
            );
        },
        [request]
    );

    const remove = useCallback(
        async (id: string) => {
            return request<null, { success: boolean }>(
                {
                    method: 'DELETE',
                    url: `/api/notes/${id}`,
                },
                null
            );
        },
        [request]
    );

    // fetch note from cache or api
    const fetch = useCallback(
        async (id: string) => {
            // reject stale nanoid IDs immediately — server will 400 them
            if (!UUID_REGEX.test(id)) {
                console.warn(`[noteAPI] skipping fetch for non-UUID id: ${id}`);
                // evict from IndexedDB in case it snuck in
                await noteCache.removeItem(id);
                return undefined;
            }

            const cache = await noteCache.getItem(id);
            if (cache) {
                return cache;
            }
            const note = await find(id);
            if (note) {
                await noteCache.setItem(id, note);
            }

            return note;
        },
        [find]
    );

    return {
        loading,
        error,
        abort,
        find,
        create,
        mutate,
        remove,
        fetch,
    };
}
