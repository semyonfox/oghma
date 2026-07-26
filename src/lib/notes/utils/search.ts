// extracted from Notea (MIT License)
// original: libs/web/utils/search.ts

import { NOTE_DELETED } from '../types/meta';
import { NoteCacheItem } from '../cache';
import noteCache from '../cache/note';

// escape regex special characters
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getSearchRegExp(keyword: string) {
  return new RegExp(escapeRegex(keyword), 'ig');
}

export async function searchNote(keyword: string, deleted: NOTE_DELETED) {
  const data = [] as NoteCacheItem[];
  const re = getSearchRegExp(keyword);

  await noteCache.iterate(async (note: any) => {
    if (note.deleted !== deleted) return;
    if (re.test(note.rawContent || '') || re.test(note.title)) {
      data.push(note);
    }
  });

  return data;
}
