// extracted from Notea (MIT License)
// original: libs/web/utils/search.ts

import { NOTE_DELETED } from '../types/meta';
import { NoteCacheItem } from '../cache';
import noteCache from '../cache/note';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getSearchRegExp(keyword: string) {
  return new RegExp(escapeRegex(keyword), 'i');
}

function isSearchableNote(value: unknown): value is NoteCacheItem {
  if (!value || typeof value !== "object") return false;

  const note = value as Partial<NoteCacheItem>;
  return typeof note.title === "string" && typeof note.deleted === "number";
}

/** Search the local cache only; server-backed search belongs to the API route. */
export async function searchNote(
  keyword: string,
  deleted: NOTE_DELETED,
): Promise<NoteCacheItem[]> {
  const data: NoteCacheItem[] = [];
  const re = getSearchRegExp(keyword);

  await noteCache.iterate(async (value) => {
    if (!isSearchableNote(value)) return;
    const note = value;
    if (note.deleted !== deleted) return;
    if (re.test(note.rawContent ?? "") || re.test(note.title)) {
      data.push(note);
    }
  });

  return data;
}
