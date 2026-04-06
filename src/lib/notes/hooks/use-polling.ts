import { useEffect, useRef, useCallback } from "react";

/**
 * Generic polling hook. Calls `fetcher` every `intervalMs` while `enabled` is true.
 * The fetcher returns { done: boolean } to signal when polling should stop.
 * Automatically cleans up on unmount or when enabled becomes false.
 */
export function usePolling(
  fetcher: () => Promise<{ done: boolean }>,
  intervalMs: number,
  enabled: boolean,
) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetcherRef = useRef(fetcher);

  // keep ref in sync without triggering re-renders
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      stop();
      return;
    }

    // avoid double-starting
    if (intervalRef.current) return;

    intervalRef.current = setInterval(async () => {
      try {
        const { done } = await fetcherRef.current();
        if (done) stop();
      } catch {
        // keep polling on transient errors
      }
    }, intervalMs);

    return stop;
  }, [enabled, intervalMs, stop]);

  return { stop };
}
