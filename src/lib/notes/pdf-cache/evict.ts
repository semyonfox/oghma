import { getAllMeta, deleteCacheEntry } from "./store";

export const MAX_ENTRIES = 50;
export const MAX_BYTES = 500 * 1024 * 1024; // 500 MB
// anything bigger would push most of the cache out to make room for itself
export const MAX_ENTRY_BYTES = 100 * 1024 * 1024;

let running: Promise<void> | null = null;

async function evictOldest(): Promise<void> {
  const entries = await getAllMeta();

  // drop the oldest downloads first; hits do not refresh cachedAt
  entries.sort((a, b) => a.cachedAt - b.cachedAt);

  let totalSize = entries.reduce((sum, e) => sum + e.size, 0);
  let count = entries.length;

  for (const entry of entries) {
    if (count <= MAX_ENTRIES && totalSize <= MAX_BYTES) break;
    await deleteCacheEntry(entry.s3Key);
    totalSize -= entry.size;
    count -= 1;
  }
}

/** Trim the cache to its bounds. Overlapping calls share one pass. */
export function runEviction(): Promise<void> {
  running ??= evictOldest().finally(() => {
    running = null;
  });
  return running;
}
