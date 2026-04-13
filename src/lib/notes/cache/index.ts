// extracted from Notea (MIT License)
import { NoteModel } from '@/lib/notes/types/note';
import { openDB, deleteDB, IDBPDatabase } from 'idb';

let uiDb: IDBPDatabase | null = null;
let noteCacheDb: IDBPDatabase | null = null;

// Initialize IndexedDB with lazy loading.
// After clearing site data some browsers (notably Firefox) leave
// the database metadata at version 1 but drop the object stores.
// When that happens the upgrade callback never fires and the 'data'
// store is missing.  Detect the broken state, delete, and retry.
const initDb = async (name: string): Promise<IDBPDatabase> => {
    let db = await openDB(name, 1, {
        upgrade(db) {
            if (!db.objectStoreNames.contains('data')) {
                db.createObjectStore('data');
            }
        },
    });

    if (!db.objectStoreNames.contains('data')) {
        db.close();
        await deleteDB(name);
        db = await openDB(name, 1, {
            upgrade(db) {
                db.createObjectStore('data');
            },
        });
    }

    return db;
};

const getDb = async (dbName: 'ui' | 'note'): Promise<IDBPDatabase> => {
    if (dbName === 'ui') {
        if (!uiDb) {
            uiDb = await initDb('oghma-ui');
        }
        return uiDb;
    } else {
        if (!noteCacheDb) {
            noteCacheDb = await initDb('oghma-notes');
        }
        return noteCacheDb;
    }
};

// Create cache-like interfaces that wrap idb
const createCacheInterface = (dbName: 'ui' | 'note') => ({
    getItem: async <T = unknown>(key: string): Promise<T | undefined> => {
        const db = await getDb(dbName);
        return db.get('data', key) as Promise<T | undefined>;
    },
    setItem: async <T = unknown>(key: string, value: T): Promise<void> => {
        const db = await getDb(dbName);
        await db.put('data', value, key);
    },
    removeItem: async (key: string): Promise<void> => {
        const db = await getDb(dbName);
        await db.delete('data', key);
    },
    clear: async (): Promise<void> => {
        const db = await getDb(dbName);
        await db.clear('data');
    },
    keys: async (): Promise<string[]> => {
        const db = await getDb(dbName);
        return (await db.getAllKeys('data')) as string[];
    },
    iterate: async (callback: (value: unknown, key: IDBValidKey) => void | Promise<void>): Promise<void> => {
        const db = await getDb(dbName);
        const allKeys = await db.getAllKeys('data');
        for (const key of allKeys) {
            const value = await db.get('data', key);
            await callback(value, key);
        }
    },
});

export const uiCache = createCacheInterface('ui');
export const noteCacheInstance = createCacheInterface('note');

export interface NoteCacheItem extends NoteModel {
    /**
     * remove markdown tag
     */
    rawContent?: string;

    linkIds?: string[];
}
