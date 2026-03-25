/**
 * Request Deduplicator - Prevents duplicate API calls
 * 
 * Problem: Multiple components might request the same data simultaneously
 * Solution: Share the same promise for identical requests
 * 
 * Example:
 *   - User navigates to note
 *   - Editor loads
 *   - Sidebar loads
 *   - All three might fetch the same note data
 * 
 * With deduplication: Only 1 fetch, shared among 3 components
 */

interface RequestKey {
  url: string;
  method: string;
  body?: string;
}

interface CachedResponse<T> {
  data: T;
  timestamp: number;
}

type PromiseStore = Map<string, Promise<any>>;
type ResponseCache = Map<string, CachedResponse<any>>;

// Global store for in-flight requests
const inflightRequests: PromiseStore = new Map();

// Global store for recently-completed requests (post-dedup cache)
// This allows requests within the window to share responses
const responseCache: ResponseCache = new Map();

// Configuration for post-dedup cache
const DEDUP_CONFIG = {
  // How long to keep recently-completed responses (milliseconds).
  // Kept short (2s) so simultaneous component mounts share one request,
  // but user interactions (create/rename/move) see fresh data.
  postDedupWindow: 2 * 1000,
  // Only deduplicate GET requests (safe to replay)
  dedupMethods: ['GET'],
  // Cleanup interval for stale responses
  cleanupInterval: 30 * 1000, // 30 seconds
};

// Cleanup interval for post-dedup cache
let cleanupIntervalId: NodeJS.Timeout | null = null;

/**
 * Start cleanup of stale responses from post-dedup cache
 */
function startPostDedupCleanup() {
  if (cleanupIntervalId) return; // Already running

  cleanupIntervalId = setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, cached] of responseCache.entries()) {
      const age = now - cached.timestamp;
      if (age > DEDUP_CONFIG.postDedupWindow) {
        responseCache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.debug(`[Dedup] Post-dedup cleanup: removed ${cleanedCount} stale responses`);
    }
  }, DEDUP_CONFIG.cleanupInterval);
}

/**
 * Stop post-dedup cleanup
 */
export function stopPostDedupCleanup() {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
}

/**
 * Generate a unique key for the request
 */
function getRequestKey(url: string, method: string, body?: string): string {
  const bodyKey = body ? `:${body}` : '';
  return `${method}:${url}${bodyKey}`;
}

/**
 * Deduplicated fetch wrapper with multi-level caching
 * 
 * Strategy:
 * 1. Check post-dedup cache (responses from last 10 seconds)
 * 2. Check in-flight requests (requests currently being fetched)
 * 3. If neither exists, make new request and cache response
 * 
 * This provides two levels of deduplication:
 * - In-flight: Combine simultaneous requests (0.5-2 second window)
 * - Post-dedup: Reuse recent responses (10 second window)
 */
export async function deduplicatedFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const method = options.method || 'GET';
  const body = options.body ? String(options.body) : undefined;
  const key = getRequestKey(url, method, body);

  // Start cleanup on first call
  startPostDedupCleanup();

  // Only deduplicate safe methods (GET, HEAD, OPTIONS)
  const shouldDeduplicate = DEDUP_CONFIG.dedupMethods.includes(method);

  // Level 1: Check post-dedup cache (if safe method)
  if (shouldDeduplicate) {
    const cached = responseCache.get(key);
    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < DEDUP_CONFIG.postDedupWindow) {
        console.debug(`[Dedup] Using cached response (age: ${age}ms): ${key}`);
        recordRequest(true);
        return cached.data;
      }
    }
  }

  // Level 2: Check if this request is already in progress
  if (shouldDeduplicate && inflightRequests.has(key)) {
    console.debug(`[Dedup] Reusing in-progress request: ${key}`);
    recordRequest(true);
    return inflightRequests.get(key)!;
  }

  // New request - create promise and store it
  const promise = (async () => {
    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      if (response.status === 204) {
        return undefined;
      }
      
      const data = await response.json();

      // Cache successful responses for post-dedup window (only safe methods).
      // Skip caching if the response carries an empty items array — these are
      // valid for an empty account but stale after the first note is created,
      // and serving them from cache would make initTree think the tree is empty.
      const isEmptyItemsResponse =
        data &&
        typeof data === 'object' &&
        Array.isArray(data.items) &&
        data.items.length === 0;

      if (shouldDeduplicate && response.status === 200 && !isEmptyItemsResponse) {
        responseCache.set(key, {
          data,
          timestamp: Date.now(),
        });
        console.debug(`[Dedup] Cached response for ${DEDUP_CONFIG.postDedupWindow}ms: ${key}`);
      }

      return data;
    } finally {
      // Remove from in-flight store after completion (success or error)
      if (shouldDeduplicate) {
        inflightRequests.delete(key);
      }
    }
  })();

  // Store the promise in in-flight requests
  if (shouldDeduplicate) {
    inflightRequests.set(key, promise);
  }

  recordRequest(false); // This is a new request, not deduplicated
  return promise;
}

/**
 * Clear all deduplication caches
 * Useful for testing or forcing refresh
 */
export function clearDeduplicationCache(): void {
  inflightRequests.clear();
  responseCache.clear();
  console.debug('[Dedup] All caches cleared');
}

/**
 * Clear only post-dedup response cache
 */
export function clearPostDedupCache(): void {
  responseCache.clear();
  console.debug('[Dedup] Post-dedup cache cleared');
}

/**
 * Get current number of in-flight requests
 */
export function getInflightRequestCount(): number {
  return inflightRequests.size;
}

/**
 * Get current number of cached responses
 */
export function getCachedResponseCount(): number {
  return responseCache.size;
}

/**
 * Get list of in-flight request keys
 */
export function getInflightRequests(): string[] {
  return Array.from(inflightRequests.keys());
}

/**
 * Get list of cached response keys
 */
export function getCachedResponses(): string[] {
  return Array.from(responseCache.keys());
}

/**
 * Get detailed deduplication statistics
 */
export function getDedupStats() {
  const now = Date.now();
  const cacheAges = Array.from(responseCache.values()).map(
    (entry) => now - entry.timestamp
  );

  return {
    inflightRequests: inflightRequests.size,
    cachedResponses: responseCache.size,
    totalRequests: stats.totalRequests,
    deduplicatedRequests: stats.deduplicatedRequests,
    dedupEfficiency: stats.totalRequests > 0
      ? Math.round((stats.deduplicatedRequests / stats.totalRequests) * 100)
      : 0,
    cacheStats: {
      oldestCacheMsOld: Math.max(...cacheAges, 0),
      newestCacheMsOld: Math.min(...cacheAges, Infinity),
      averageCacheMsOld:
        cacheAges.length > 0
          ? Math.round(cacheAges.reduce((a, b) => a + b, 0) / cacheAges.length)
          : 0,
    },
  };
}

/**
 * Statistics about deduplication
 */
let stats = {
  totalRequests: 0,
  deduplicatedRequests: 0,
};

export function resetStats(): void {
  stats = { totalRequests: 0, deduplicatedRequests: 0 };
}

/**
 * @deprecated Use getDedupStats() instead for more detailed information
 */
export function getStats() {
  return getDedupStats();
}

/**
 * Update stats when a request is deduplicated
 */
export function recordRequest(wasDeduplicated: boolean): void {
  stats.totalRequests++;
  if (wasDeduplicated) {
    stats.deduplicatedRequests++;
  }
}
