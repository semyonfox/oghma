// server-side Redis cache layer for API responses
// uses hash tags {userId} so all keys for a user land on the same cluster slot
import { redis, redisReady } from '@/lib/redis';
import logger from '@/lib/logger';

const MAX_CACHEABLE_SIZE = 100 * 1024; // 100KB

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redisReady) return null;
  try {
    const start = performance.now();
    const raw = await redis.get(key);
    const ms = (performance.now() - start).toFixed(1);
    if (!raw) {
      logger.info('cache MISS', { key, ms });
      return null;
    }
    logger.info('cache HIT', { key, ms, bytes: raw.length });
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.warn('cache get failed', { key, error: (err as Error).message });
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (!redisReady) return;
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length > MAX_CACHEABLE_SIZE) {
      logger.info('cache SKIP (too large)', { key, bytes: serialized.length });
      return;
    }
    const start = performance.now();
    await redis.set(key, serialized, 'EX', ttlSeconds);
    const ms = (performance.now() - start).toFixed(1);
    logger.info('cache SET', { key, ms, bytes: serialized.length, ttl: ttlSeconds });
  } catch (err) {
    logger.warn('cache set failed', { key, error: (err as Error).message });
  }
}

export async function cacheInvalidate(...keys: string[]): Promise<void> {
  if (!redisReady || keys.length === 0) return;
  try {
    const start = performance.now();
    await Promise.all(keys.map((k) => redis.del(k)));
    const ms = (performance.now() - start).toFixed(1);
    logger.info('cache DEL', { keys, ms });
  } catch (err) {
    logger.warn('cache invalidate failed', { keys, error: (err as Error).message });
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
  settings: (userId: string | number) =>
    `cache:{${userId}}:settings`,
};
