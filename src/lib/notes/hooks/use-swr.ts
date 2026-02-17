/**
 * SWR Hook - Stale-While-Revalidate Pattern
 * 
 * Strategy: Serve cached data immediately, then revalidate in background
 * 
 * Benefits:
 * - Instant UI response (perceived performance)
 * - Always up-to-date data (background refresh)
 * - Reduced server load (cached responses)
 * - Network error resilience (cached fallback)
 * 
 * Typical flow:
 * 1. User loads page
 * 2. Cached data shown immediately
 * 3. Background fetch starts
 * 4. New data replaces cache when ready
 * 5. Components rerender with fresh data
 */

import { useEffect, useRef, useState, useCallback } from 'react';

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
  error?: Error;
  accessCount?: number;
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

/**
 * Start automatic cache cleanup
 */
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
      const entries = Array.from(globalCache.entries())
        .sort((a, b) => (a[1].lastAccessedAt ?? 0) - (b[1].lastAccessedAt ?? 0));
      
      const toDelete = entries.length - CACHE_CONFIG.maxSize;
      for (let i = 0; i < toDelete; i++) {
        globalCache.delete(entries[i][0]);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.debug(`[SWR] Cache cleanup: removed ${deletedCount} entries, current size: ${globalCache.size}`);
    }
  }, CACHE_CONFIG.cleanupInterval);
}

/**
 * Stop automatic cache cleanup (for testing/shutdown)
 */
export function stopCacheCleanup() {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
}

/**
 * React hook for SWR data fetching
 */
export function useSWR<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: SWROptions = {}
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

  /**
   * Check if cache is still fresh
   */
  const isCacheFresh = useCallback((): boolean => {
    const cached = globalCache.get(key);
    if (!cached) return false;

    const age = Date.now() - cached.timestamp;
    return age < cacheDuration;
  }, [key, cacheDuration]);

  /**
   * Get cached data if available (tracks access for LRU eviction)
   */
  const getCachedData = useCallback((): T | undefined => {
    const cached = globalCache.get(key);
    if (cached) {
      // Update access tracking for LRU (Least Recently Used) eviction
      cached.lastAccessedAt = Date.now();
      cached.accessCount = (cached.accessCount ?? 0) + 1;
    }
    return cached?.data;
  }, [key]);

  /**
   * Fetch and cache data
   */
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
    [key, fetcher, isCacheFresh, getCachedData, dedupeDuration]
  );

  /**
   * Manual mutation (update cache without fetching)
   */
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
    [key, fetchData]
  );

  /**
   * Initial load and setup
   */
  useEffect(() => {
    // Start automatic cache cleanup on first hook usage
    startCacheCleanup();

    const cached = getCachedData();

    // If we have fresh cache, use it immediately
    if (cached && isCacheFresh()) {
      setData(cached);
      setIsLoading(false);
      // Still revalidate in background
      fetchData(true).catch(console.error);
      return;
    }

    // No fresh cache, fetch now
    fetchData(false).catch(console.error);
  }, [key, fetchData, getCachedData, isCacheFresh]);

  /**
   * Revalidation interval
   */
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

  /**
   * Revalidate on focus
   */
  useEffect(() => {
    if (!revalidateOnFocus) return;

    const handleFocus = () => {
      // Check if cache is stale
      if (!isCacheFresh()) {
        fetchData(true).catch(console.error);
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [revalidateOnFocus, isCacheFresh, fetchData]);

  return {
    data,
    error,
    isLoading,
    isValidating,
    mutate,
  };
}

/**
 * Clear global SWR cache
 */
export function clearSWRCache(): void {
  globalCache.clear();
  console.debug('[SWR] Cache cleared');
}

/**
 * Get detailed cache statistics for monitoring
 */
export function getSWRCacheStats() {
  const entries = Array.from(globalCache.entries());
  const now = Date.now();
  
  return {
    // Basic stats
    cacheSize: globalCache.size,
    maxCacheSize: CACHE_CONFIG.maxSize,
    ongoingRequests: ongoingRequests.size,
    
    // Cache health
    entries: entries.map(([key, entry]) => ({
      key,
      age: now - entry.timestamp,
      accessCount: entry.accessCount ?? 0,
      lastAccessedAt: entry.lastAccessedAt ? now - entry.lastAccessedAt : 'never',
    })),
    
    // Memory warnings
    warnings: {
      nearCapacity: globalCache.size > CACHE_CONFIG.maxSize * 0.8,
      hasStaleEntries: entries.some(([_, e]) => (now - e.timestamp) > CACHE_CONFIG.maxCacheDuration),
    },
  };
}

/**
 * Get estimated memory usage of the cache (rough estimate)
 */
export function estimateCacheMemory(): { entries: number; estimatedBytes: number } {
  let estimatedBytes = 0;
  
  for (const entry of globalCache.values()) {
    // Rough estimate: JSON.stringify the data to estimate size
    try {
      estimatedBytes += JSON.stringify(entry.data).length;
    } catch {
      estimatedBytes += 1024; // Default 1 KB if serialization fails
    }
  }
  
  return {
    entries: globalCache.size,
    estimatedBytes,
  };
}
