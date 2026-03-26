// extracted from Notea (MIT License)
import { TreeModel } from '@/lib/notes/types/tree';
import { noteCacheInstance, NoteCacheItem } from '@/lib/notes/cache';
import { isNoteLink, NoteModel } from '@/lib/notes/types/note';
import { removeMarkdown } from '@/lib/notes/utils/markdown';
import markdownLinkExtractor from 'markdown-link-extractor';

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

/**
 * 清除本地存储中未使用的 note
 */
async function checkItems(items: TreeModel['items']) {
    const noteIds = Object.keys(items);
    const localNoteIds = await noteCache.keys();
    // remove notes absent from the current tree AND notes with invalid (non-UUID) IDs
    const toRemove = localNoteIds.filter(id => !noteIds.includes(id) || !isUUID(id));

    await Promise.all(
        toRemove.map((id) => (id ? noteCache.removeItem(id) : undefined))
    );
}

async function getItem(id: string) {
    return noteCacheInstance.getItem<NoteCacheItem>(id);
}

async function setItem(id: string, note: NoteModel) {
    const extractorLinks = markdownLinkExtractor(note.content ?? '', false);
    const linkIds: string[] = [];
    if (Array.isArray(extractorLinks) && extractorLinks.length) {
        extractorLinks.forEach((link) => {
            if (isNoteLink(link)) {
                linkIds.push(link.slice(1));
            }
        });
    }
    return noteCacheInstance.setItem<NoteCacheItem>(id, {
        ...note,
        rawContent: removeMarkdown(note.content),
        linkIds,
    });
}

async function mutateItem(id: string, body: Partial<NoteModel>) {
    const note = await getItem(id);

    if (!note) {
        // note not in cache yet, store whatever we have
        // this happens when saving before the cache is populated
        console.debug('note not in cache, creating entry:', id);
        await noteCacheInstance.setItem(id, body as NoteCacheItem);
        return;
    }

    await setItem(id, {
        ...note,
        ...body,
    });
}

const noteCache = {
    ...noteCacheInstance,
    getItem,
    setItem,
    mutateItem,
    checkItems,
};

export default noteCache;
