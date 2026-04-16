import { useEffect, useRef } from "react";

export interface PollingJobOptions {
  /** URL to poll */
  url: string;
  /** Polling interval in ms (default 3000) */
  interval?: number;
  /** Whether polling is active */
  enabled: boolean;
  /**
   * Called on each successful poll response. Return true to stop polling
   * (terminal state reached). The raw JSON data is passed in.
   */
  onData: (data: any) => boolean;
  /** Called when a poll request fails (optional) */
  onError?: (error: unknown) => void;
}

/**
 * Generic polling hook for long-running jobs.
 * Polls the given URL at the given interval while `enabled` is true.
 * The `onData` callback should return `true` when the job has reached
 * a terminal state and polling should stop.
 */
export function usePollingJob({
  url,
  interval = 3000,
  enabled,
  onData,
  onError,
}: PollingJobOptions): void {
  // keep callbacks in refs so the interval closure always sees the latest
  const onDataRef = useRef(onData);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onDataRef.current = onData;
    onErrorRef.current = onError;
  }, [onData, onError]);

  // track whether we've self-stopped so we don't keep firing
  const stoppedRef = useRef(false);

  // reset stopped flag when enabled transitions back to true
  useEffect(() => {
    if (enabled) {
      stoppedRef.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const timer = setInterval(async () => {
      if (stoppedRef.current) return;

      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        const done = onDataRef.current(data);
        if (done) {
          stoppedRef.current = true;
          clearInterval(timer);
        }
      } catch (err) {
        onErrorRef.current?.(err);
      }
    }, interval);

    return () => clearInterval(timer);
  }, [url, interval, enabled]);
}
