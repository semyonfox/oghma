// server-side Redis cache layer for API responses
// uses hash tags {userId} so all keys for a user land on the same cluster slot
import { redis, redisReady, ensureRedisReady } from '@/lib/redis';
import logger from '@/lib/logger';

const MAX_CACHEABLE_SIZE = 100 * 1024; // 100KB

// hits, misses and writes are not logged: the logger strips all metadata, so
// they would only add an anonymous info line to every cached read
export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redisReady) return null;
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (err) {
    logger.warn('cache get failed', { key, error: err });
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (!redisReady) return;
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length > MAX_CACHEABLE_SIZE) return;
    await redis.set(key, serialized, 'EX', ttlSeconds);
  } catch (err) {
    logger.warn('cache set failed', { key, error: err });
  }
}

export async function cacheInvalidate(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    // Cold route modules must connect before invalidating an existing cache.
    // Skipping this write leaves other routes serving pre-mutation data.
    if (!redisReady && !(await ensureRedisReady())) return;
    await Promise.all(keys.map((k) => redis.del(k)));
  } catch (err) {
    logger.warn('cache invalidate failed', { keys, error: err });
  }
}

// key builders — centralised so invalidation always matches reads
export const cacheKeys = {
  treeChildren: (userId: string, parentId: string | null) =>
    `cache:{${userId}}:tree:children:${parentId || 'root'}`,
  treeFull: (userId: string) =>
    `cache:{${userId}}:tree:full`,
  note: (userId: string, noteId: string) =>
    `cache:{${userId}}:note:${noteId}`,
  notesList: (userId: string, skip: number, limit: number | undefined) =>
    `cache:{${userId}}:notes:list:${skip}:${limit ?? 'all'}`,
  settings: (userId: string) =>
    `cache:{${userId}}:settings`,
};
