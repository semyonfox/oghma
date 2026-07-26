/**
 * Stale-while-revalidate hook. Serves cached data immediately, revalidates in
 * the background, and falls back to the cache when a fetch fails.
 */

import { useEffect, useRef, useState, useCallback } from "react";

interface SWROptions {
  // Cache duration in milliseconds
  cacheDuration?: number;
  // Dedupe requests within this duration
  dedupeDuration?: number;
  // Auto-revalidate every X milliseconds
  revalidateInterval?: number;
  // Revalidate when window regains focus
  revalidateOnFocus?: boolean;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  // drives LRU eviction once the cache passes CACHE_CONFIG.maxSize
  lastAccessedAt?: number;
}

// Global cache store
const globalCache = new Map<string, CacheEntry<any>>();

// Track ongoing requests to dedupe
const ongoingRequests = new Map<string, Promise<any>>();

// Configuration for cache memory management
const CACHE_CONFIG = {
  maxSize: 100, // Maximum number of cache entries
  cleanupInterval: 5 * 60 * 1000, // Cleanup every 5 minutes
  maxCacheDuration: 30 * 60 * 1000, // Delete entries older than 30 minutes
};

// Initialize cleanup interval
let cleanupIntervalId: NodeJS.Timeout | null = null;
let activeHookCount = 0;

function startCacheCleanup() {
  if (cleanupIntervalId) return; // Already running

  cleanupIntervalId = setInterval(() => {
    const now = Date.now();
    let deletedCount = 0;

    // Remove stale entries (older than maxCacheDuration)
    for (const [key, entry] of globalCache.entries()) {
      const age = now - entry.timestamp;
      if (age > CACHE_CONFIG.maxCacheDuration) {
        globalCache.delete(key);
        deletedCount++;
      }
    }

    // If still over max size, remove least recently used entries
    if (globalCache.size > CACHE_CONFIG.maxSize) {
      const entries = Array.from(globalCache.entries()).sort(
        (a, b) => (a[1].lastAccessedAt ?? 0) - (b[1].lastAccessedAt ?? 0),
      );

      const toDelete = entries.length - CACHE_CONFIG.maxSize;
      for (let i = 0; i < toDelete; i++) {
        globalCache.delete(entries[i][0]);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.debug(
        `[SWR] Cache cleanup: removed ${deletedCount} entries, current size: ${globalCache.size}`,
      );
    }
  }, CACHE_CONFIG.cleanupInterval);
}

export function stopCacheCleanup() {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
}

export function useSWR<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: SWROptions = {},
): {
  data?: T;
  error?: Error;
  isLoading: boolean;
  isValidating: boolean;
  mutate: (data?: T) => Promise<T | undefined>;
} {
  const {
    cacheDuration = 5 * 60 * 1000, // 5 minutes
    dedupeDuration = 1000, // 1 second
    revalidateInterval = 0, // disabled by default
    revalidateOnFocus = true,
  } = options;

  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<Error | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);

  const lastFetchRef = useRef<number>(0);
  const revalidateTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const isCacheFresh = useCallback((): boolean => {
    const cached = globalCache.get(key);
    if (!cached) return false;

    const age = Date.now() - cached.timestamp;
    return age < cacheDuration;
  }, [key, cacheDuration]);

  const getCachedData = useCallback((): T | undefined => {
    const cached = globalCache.get(key);
    // reading counts as an access, which is what LRU eviction sorts on
    if (cached) cached.lastAccessedAt = Date.now();
    return cached?.data;
  }, [key]);

  const fetchData = useCallback(
    async (isBackground = false) => {
      if (!isBackground) {
        setIsLoading(true);
      }
      setIsValidating(true);

      try {
        // Check for ongoing request (deduplication)
        if (ongoingRequests.has(key)) {
          console.debug(`[SWR] Deduping request: ${key}`);
          const result = await ongoingRequests.get(key)!;
          setData(result);
          setError(undefined);
          return result;
        }

        // Avoid refetch if done recently
        const timeSinceLastFetch = Date.now() - lastFetchRef.current;
        if (timeSinceLastFetch < dedupeDuration && isCacheFresh()) {
          return getCachedData();
        }

        // Create fetch promise
        const fetchPromise = fetcher();
        ongoingRequests.set(key, fetchPromise);

        // Wait for fetch
        const result = await fetchPromise;

        // Cache the result
        globalCache.set(key, {
          data: result,
          timestamp: Date.now(),
        });

        setData(result);
        setError(undefined);
        lastFetchRef.current = Date.now();

        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);

        // If we have cached data, use it as fallback
        const cached = getCachedData();
        if (cached) {
          setData(cached);
        }

        return cached;
      } finally {
        ongoingRequests.delete(key);
        if (!isBackground) {
          setIsLoading(false);
        }
        setIsValidating(false);
      }
    },
    [key, fetcher, isCacheFresh, getCachedData, dedupeDuration],
  );

  const mutate = useCallback(
    async (newData?: T): Promise<T | undefined> => {
      if (newData !== undefined) {
        globalCache.set(key, {
          data: newData,
          timestamp: Date.now(),
        });
        setData(newData);
      }

      // Revalidate after mutation
      return fetchData(false);
    },
    [key, fetchData],
  );

  useEffect(() => {
    activeHookCount++;
    startCacheCleanup();

    const cached = getCachedData();
    if (cached && isCacheFresh()) {
      // Serve the cache immediately, then refresh behind it.
      setData(cached);
      setIsLoading(false);
      fetchData(true).catch(console.error);
    } else {
      fetchData(false).catch(console.error);
    }

    return () => {
      activeHookCount--;
      if (activeHookCount === 0) stopCacheCleanup();
    };
  }, [key, fetchData, getCachedData, isCacheFresh]);

  useEffect(() => {
    if (revalidateInterval <= 0) return;

    revalidateTimerRef.current = setInterval(() => {
      fetchData(true).catch(console.error);
    }, revalidateInterval);

    return () => {
      if (revalidateTimerRef.current) {
        clearInterval(revalidateTimerRef.current);
      }
    };
  }, [revalidateInterval, fetchData]);

  useEffect(() => {
    if (!revalidateOnFocus) return;

    const handleFocus = () => {
      // Check if cache is stale
      if (!isCacheFresh()) {
        fetchData(true).catch(console.error);
      }
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [revalidateOnFocus, isCacheFresh, fetchData]);

  return {
    data,
    error,
    isLoading,
    isValidating,
    mutate,
  };
}

