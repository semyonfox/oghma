import { getAllEntries, deleteCacheEntry } from "./store";

const MAX_ENTRIES = 50;
const MAX_BYTES = 500 * 1024 * 1024; // 500 MB

export async function runEviction(): Promise<void> {
  const entries = await getAllEntries();

  // sort oldest first
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
