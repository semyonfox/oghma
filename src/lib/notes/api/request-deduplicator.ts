/**
 * Components that mount together (editor, sidebar, tree) can request the same
 * note data at once. Share only that in-flight request: once it settles, the
 * next read fetches current server state.
 */

const inflightRequests = new Map<string, Promise<unknown>>();

function getRequestKey(url: string, method: string): string {
  return method + ":" + url;
}

/**
 * Only safe GET requests share an already in-flight promise. Completed
 * responses are deliberately not cached here.
 */
export async function deduplicatedFetch<T>(
  url: string,
  options: RequestInit = {},
): Promise<T | undefined> {
  const method = options.method?.toUpperCase() ?? "GET";
  const key = getRequestKey(url, method);
  const shouldDeduplicate = method === "GET";
  const inflight = shouldDeduplicate ? inflightRequests.get(key) : undefined;

  if (inflight) {
    console.debug("[Dedup] Reusing in-progress request: " + key);
    return inflight as Promise<T | undefined>;
  }

  const promise = (async (): Promise<T | undefined> => {
    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        throw new Error("HTTP " + response.status + ": " + response.statusText);
      }

      if (response.status === 204) {
        return undefined;
      }

      return (await response.json()) as T;
    } finally {
      if (shouldDeduplicate) {
        inflightRequests.delete(key);
      }
    }
  })();

  if (shouldDeduplicate) {
    inflightRequests.set(key, promise);
  }

  return promise;
}

export function clearDeduplicationCache(): void {
  inflightRequests.clear();
}
