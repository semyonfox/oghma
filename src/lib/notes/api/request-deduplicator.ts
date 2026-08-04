/**
 * Request deduplicator. Components that mount together (editor, sidebar, tree)
 * often request the same note data at once; they share one promise instead of
 * issuing parallel identical fetches.
 */

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
  dedupMethods: ["GET"],
  // Cleanup interval for stale responses
  cleanupInterval: 30 * 1000, // 30 seconds
};

// Cleanup interval for post-dedup cache
let cleanupIntervalId: NodeJS.Timeout | null = null;

function startPostDedupCleanup() {
  if (cleanupIntervalId) return;

  cleanupIntervalId = setInterval(() => {
    const now = Date.now();
    for (const [key, cached] of responseCache.entries()) {
      if (now - cached.timestamp > DEDUP_CONFIG.postDedupWindow) {
        responseCache.delete(key);
      }
    }
  }, DEDUP_CONFIG.cleanupInterval);
}

export function stopPostDedupCleanup() {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
}

function getRequestKey(url: string, method: string, body?: string): string {
  const bodyKey = body ? `:${body}` : "";
  return `${method}:${url}${bodyKey}`;
}

/**
 * Deduplicated fetch wrapper. Reuses a recently-completed response first, then
 * an already in-flight promise, before issuing a new request.
 */
export async function deduplicatedFetch<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const method = options.method || "GET";
  const body = options.body ? String(options.body) : undefined;
  const key = getRequestKey(url, method, body);

  startPostDedupCleanup();

  const shouldDeduplicate = DEDUP_CONFIG.dedupMethods.includes(method);

  if (shouldDeduplicate) {
    const cached = responseCache.get(key);
    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < DEDUP_CONFIG.postDedupWindow) {
        console.debug(`[Dedup] Using cached response (age: ${age}ms): ${key}`);
        return cached.data;
      }
    }
  }

  if (shouldDeduplicate && inflightRequests.has(key)) {
    console.debug(`[Dedup] Reusing in-progress request: ${key}`);
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
        typeof data === "object" &&
        Array.isArray(data.items) &&
        data.items.length === 0;

      if (
        shouldDeduplicate &&
        response.status === 200 &&
        !isEmptyItemsResponse
      ) {
        responseCache.set(key, {
          data,
          timestamp: Date.now(),
        });
        console.debug(
          `[Dedup] Cached response for ${DEDUP_CONFIG.postDedupWindow}ms: ${key}`,
        );
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

  return promise;
}

export function clearDeduplicationCache(): void {
  inflightRequests.clear();
  responseCache.clear();
}

export function clearPostDedupCache(): void {
  responseCache.clear();
}

