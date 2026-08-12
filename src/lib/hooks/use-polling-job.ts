import { useEffect, useRef } from "react";

export interface PollingJobData {
  job?: {
    status?: string;
    error?: string;
    jobId?: string;
  };
  progress?: {
    completed: number;
    total: number;
    percent?: number;
  };
  downloadUrl?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isPollingJobData(value: unknown): value is PollingJobData {
  if (!isRecord(value)) return false;

  const job = value.job;
  if (
    job !== undefined &&
    (!isRecord(job) ||
      !isOptionalString(job.status) ||
      !isOptionalString(job.error) ||
      !isOptionalString(job.jobId))
  ) {
    return false;
  }

  const progress = value.progress;
  if (
    progress !== undefined &&
    (!isRecord(progress) ||
      typeof progress.completed !== "number" ||
      typeof progress.total !== "number" ||
      (progress.percent !== undefined && typeof progress.percent !== "number"))
  ) {
    return false;
  }

  return isOptionalString(value.downloadUrl);
}

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
  onData: (data: PollingJobData) => boolean;
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

  // Track self-stops so the poll does not continue.
  const stoppedRef = useRef(false);

  // reset stopped flag when enabled transitions back to true
  useEffect(() => {
    if (enabled) {
      stoppedRef.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    let activeController: AbortController | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;

    const poll = async () => {
      // An interval tick is not a request queue. If a poll is slow, skip the
      // tick and wait for the next interval after it settles.
      if (stoppedRef.current || activeController) return;

      const controller = new AbortController();
      activeController = controller;

      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!active || controller.signal.aborted) return;
        if (!res.ok) return;
        const data: unknown = await res.json();
        if (!active || controller.signal.aborted) return;
        if (!isPollingJobData(data)) {
          onErrorRef.current?.(new Error("Invalid polling job response"));
          return;
        }
        const done = onDataRef.current(data);
        if (done) {
          stoppedRef.current = true;
          if (timer) clearInterval(timer);
        }
      } catch (err) {
        if (active && !controller.signal.aborted) {
          onErrorRef.current?.(err);
        }
      } finally {
        if (activeController === controller) {
          activeController = undefined;
        }
      }
    };

    timer = setInterval(() => {
      void poll();
    }, interval);

    return () => {
      active = false;
      clearInterval(timer);
      activeController?.abort();
    };
  }, [url, interval, enabled]);
}
