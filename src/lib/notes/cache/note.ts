// extracted from Notea (MIT License)
import { noteCacheInstance } from '@/lib/notes/cache';
import { NoteModel } from '@/lib/notes/types/note';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID = (id: string) => UUID_REGEX.test(id);

/**
 * Purge stale nanoid-format keys from the note cache.
 * These were created before the app switched to UUID v7 IDs and the
 * server now rejects them with 400, causing endless retry loops.
 */
export async function purgeNonUUIDNoteCache(): Promise<void> {
    const keys = await noteCache.keys();
    const stale = keys.filter(k => k && !isUUID(k));
    if (stale.length > 0) {
        console.debug(`[cache] purging ${stale.length} stale non-UUID note(s):`, stale);
        await Promise.all(stale.map(k => noteCache.removeItem(k)));
    }
}

async function getItem(id: string) {
    return noteCacheInstance.getItem<NoteModel>(id);
}

async function setItem(id: string, note: NoteModel) {
    return noteCacheInstance.setItem<NoteModel>(id, note);
}

const noteCache = {
    ...noteCacheInstance,
    getItem,
    setItem,
};

export default noteCache;
