import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "oghmanotes-pdf-cache";
const DB_VERSION = 1;
const STORE_NAME = "pdf-entries";

export interface PdfCacheEntry {
  s3Key: string;
  buffer: ArrayBuffer;
  size: number;
  cachedAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "s3Key" });
        }
      },
    });
  }
  return dbPromise;
}

export async function getCacheEntry(
  s3Key: string,
): Promise<PdfCacheEntry | undefined> {
  const db = await getDb();
  return db.get(STORE_NAME, s3Key);
}

export async function putCacheEntry(entry: PdfCacheEntry): Promise<void> {
  const db = await getDb();
  await db.put(STORE_NAME, entry);
}

export async function deleteCacheEntry(s3Key: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, s3Key);
}

export async function getAllEntries(): Promise<PdfCacheEntry[]> {
  const db = await getDb();
  return db.getAll(STORE_NAME);
}
