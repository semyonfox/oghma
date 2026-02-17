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

type PromiseStore = Map<string, Promise<any>>;

// Global store for in-flight requests
const inflightRequests: PromiseStore = new Map();

/**
 * Generate a unique key for the request
 */
function getRequestKey(url: string, method: string, body?: string): string {
  const bodyKey = body ? `:${body}` : '';
  return `${method}:${url}${bodyKey}`;
}

/**
 * Deduplicated fetch wrapper
 * If an identical request is already in progress, return that promise
 * Otherwise, make the request and store the promise
 */
export async function deduplicatedFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const method = options.method || 'GET';
  const body = options.body ? String(options.body) : undefined;
  const key = getRequestKey(url, method, body);

  // Check if this request is already in progress
  if (inflightRequests.has(key)) {
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
      
      return response.json();
    } finally {
      // Remove from store after completion (success or error)
      inflightRequests.delete(key);
    }
  })();

  // Store the promise
  inflightRequests.set(key, promise);

  return promise;
}

/**
 * Clear the deduplication cache
 * Useful for testing or forcing refresh
 */
export function clearDeduplicationCache(): void {
  inflightRequests.clear();
  console.debug('[Dedup] Cache cleared');
}

/**
 * Get current number of in-flight requests
 * Useful for debugging
 */
export function getInflightRequestCount(): number {
  return inflightRequests.size;
}

/**
 * Get list of in-flight request keys
 * Useful for debugging
 */
export function getInflightRequests(): string[] {
  return Array.from(inflightRequests.keys());
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

export function getStats() {
  return {
    ...stats,
    efficiency: stats.totalRequests > 0
      ? Math.round((stats.deduplicatedRequests / stats.totalRequests) * 100)
      : 0,
  };
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
