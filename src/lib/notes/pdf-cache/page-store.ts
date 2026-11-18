import { openDB, type IDBPDatabase } from "idb";

// rendered page images, so a board card shows its page without downloading
// and re-rendering the whole PDF. its own database: adding a store to the
// bytes cache would need a version bump that blocks tabs on the old build
const DB_NAME = "oghmanotes-pdf-pages-v1";
const DB_VERSION = 1;
const STORE = "pages";
const MAX_PAGES = 400;

interface PageImageEntry {
  key: string;
  blob: Blob;
  cachedAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;
// object URLs for this tab, so a card scrolling back into view is instant
const urls = new Map<string, string>();
let evicting: Promise<void> | null = null;
// bumped on clear, so renders started for the previous account are dropped
let generation = 0;

export function pageCacheGeneration(): number {
  return generation;
}

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    // async so a missing indexedDB (private mode, tests) rejects instead of throwing
    dbPromise = (async () =>
      openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE, { keyPath: "key" });
          }
        },
        blocking() {
          void dbPromise?.then((db) => db.close());
          dbPromise = null;
        },
      }))().catch((error: unknown) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

function remember(key: string, blob: Blob): string {
  const existing = urls.get(key);
  if (existing) return existing;
  const url = URL.createObjectURL(blob);
  urls.set(key, url);
  return url;
}

export function memoryPageUrl(key: string): string | undefined {
  return urls.get(key);
}

/** a page rendered in an earlier session. IndexedDB failures count as a miss */
export async function storedPageUrl(
  key: string,
  startedIn: number,
): Promise<string | undefined> {
  const entry: PageImageEntry | undefined = await getDb()
    .then((db) => db.get(STORE, key))
    .catch(() => undefined);
  if (startedIn !== generation) throw new Error("page cache was cleared");
  return entry?.blob instanceof Blob ? remember(key, entry.blob) : undefined;
}

async function evictOldest(): Promise<void> {
  const db = await getDb();
  // blobs come back as handles, so reading every entry does not load the images
  const entries: PageImageEntry[] = await db.getAll(STORE);
  if (entries.length <= MAX_PAGES) return;
  entries.sort((a, b) => a.cachedAt - b.cachedAt);
  const tx = db.transaction(STORE, "readwrite");
  await Promise.all([
    ...entries
      .slice(0, entries.length - MAX_PAGES)
      .map((entry) => tx.store.delete(entry.key)),
    tx.done,
  ]);
}

export function storePage(key: string, blob: Blob, startedIn: number): string {
  if (startedIn !== generation) throw new Error("page cache was cleared");
  const url = remember(key, blob);
  void getDb()
    .then((db) => db.put(STORE, { key, blob, cachedAt: Date.now() }))
    .then(() => {
      evicting ??= evictOldest().finally(() => {
        evicting = null;
      });
      return evicting;
    })
    .catch(() => {});
  return url;
}

/** pages belong to the account that rendered them, like the PDF bytes */
export async function clearPdfPageImages(): Promise<void> {
  generation += 1;
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
  const db = await getDb();
  await db.clear(STORE);
}
