'use client';

// edit container hook - manages note lifecycle (load, create, daily notes)
// ported from Notea's edit-container.tsx (MIT License) - adapted for App Router
import useNoteStore from '@/lib/notes/state/note';
import useNoteTreeStore from '@/lib/notes/state/tree';
import useUIComposite from '@/lib/notes/state/ui';
import noteCache from '@/lib/notes/cache/note';
import useSettingsAPI from '@/lib/notes/api/settings';
import { useToast } from '@/lib/notes/hooks/use-toast';
import { useCallback, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';

export function useEditContainer() {
    const {
        title: { updateTitle },
        settings: { settings },
    } = useUIComposite();
    const { genNewId } = useNoteTreeStore();
    const { fetchNote, abortFindNote, findOrCreateNote, initNote, note } =
        useNoteStore();
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();

    const id = params?.id as string;
    const pid = searchParams?.get('pid') ?? undefined;
    const isNew = searchParams?.has('new') ?? false;
    const { mutate: mutateSettings } = useSettingsAPI();
    const toast = useToast();

    const loadNoteById = useCallback(
        async (id: string) => {
            // daily notes - matches YYYY-M-D or YYYY-MM-DD
            if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(id)) {
                await findOrCreateNote(id, {
                    id,
                    title: id,
                    content: '\n',
                    pid: settings.daily_root_id,
                });
            } else if (id === 'new') {
                const newId = genNewId();
                const url = `/${newId}?new` + (pid ? `&pid=${pid}` : '');
                router.replace(url);
            } else if (id && !isNew) {
                try {
                    const result = await fetchNote(id);
                    if (!result) {
                        router.replace(`/${id}?new=1`);
                        return;
                    }
                } catch (msg) {
                    const err = msg as Error;
                    if (err.name !== 'AbortError') {
                        toast(err.message, 'error');
                        router.push('/notes');
                    }
                }
            } else {
                // new note with specific ID
                if (await noteCache.getItem(id)) {
                    router.push(`/${id}`);
                    return;
                }

                initNote({
                    id,
                    content: '\n',
                });
            }

            if (!isNew && id !== 'new') {
                await mutateSettings({
                    last_visit: `/${id}`,
                } as any);
            }
        },
        [
            isNew,
            findOrCreateNote,
            settings.daily_root_id,
            genNewId,
            pid,
            fetchNote,
            toast,
            initNote,
            mutateSettings,
            router,
        ]
    );

    useEffect(() => {
        if (!id) return;
        abortFindNote();
        loadNoteById(id)?.catch((v) =>
            console.error('Could not load note: %O', v)
        );
    }, [loadNoteById, abortFindNote, id]);

    useEffect(() => {
        updateTitle(note?.title);
    }, [note?.title, updateTitle]);

    return { note };
}
