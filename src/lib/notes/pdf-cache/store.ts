import { deleteDB, openDB, type IDBPDatabase } from "idb";

// a new name rather than a version bump: tabs still running the old build hold
// v1 open, and an upgrade would block every PDF open here until they close
const DB_NAME = "oghmanotes-pdf-cache-v2";
const LEGACY_DB_NAME = "oghmanotes-pdf-cache";
const DB_VERSION = 1;
const ENTRY_STORE = "pdf-entries";
// sizes live apart from the bytes so eviction never loads every PDF into memory
const META_STORE = "pdf-meta";

export interface PdfCacheEntry {
  s3Key: string;
  buffer: ArrayBuffer;
  size: number;
  cachedAt: number;
  /** MIME type from the server; older entries lack it (assume PDF) */
  contentType?: string;
}

export interface PdfCacheMeta {
  s3Key: string;
  size: number;
  cachedAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(ENTRY_STORE)) {
          db.createObjectStore(ENTRY_STORE, { keyPath: "s3Key" });
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: "s3Key" });
        }
      },
      blocking() {
        // let a future build upgrade instead of hanging behind this tab
        void dbPromise?.then((db) => db.close());
        dbPromise = null;
      },
    }).catch((error: unknown) => {
      dbPromise = null;
      throw error;
    });
    // the old store is only a cache; drop it once nothing holds it open
    void deleteDB(LEGACY_DB_NAME).catch(() => {});
  }
  return dbPromise;
}

export async function getCacheEntry(
  s3Key: string,
): Promise<PdfCacheEntry | undefined> {
  const db = await getDb();
  return db.get(ENTRY_STORE, s3Key);
}

export async function putCacheEntry(entry: PdfCacheEntry): Promise<void> {
  const db = await getDb();
  const tx = db.transaction([ENTRY_STORE, META_STORE], "readwrite");
  const meta: PdfCacheMeta = {
    s3Key: entry.s3Key,
    size: entry.size,
    cachedAt: entry.cachedAt,
  };
  await Promise.all([
    tx.objectStore(ENTRY_STORE).put(entry),
    tx.objectStore(META_STORE).put(meta),
    tx.done,
  ]);
}

export async function deleteCacheEntry(s3Key: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction([ENTRY_STORE, META_STORE], "readwrite");
  await Promise.all([
    tx.objectStore(ENTRY_STORE).delete(s3Key),
    tx.objectStore(META_STORE).delete(s3Key),
    tx.done,
  ]);
}

export async function getAllMeta(): Promise<PdfCacheMeta[]> {
  const db = await getDb();
  return db.getAll(META_STORE);
}

/** Drop every cached PDF, e.g. when a different account takes over the browser. */
export async function clearPdfCache(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction([ENTRY_STORE, META_STORE], "readwrite");
  await Promise.all([
    tx.objectStore(ENTRY_STORE).clear(),
    tx.objectStore(META_STORE).clear(),
    tx.done,
  ]);
}
