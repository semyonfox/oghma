import { useEffect, useRef } from "react";

interface PollingJobData {
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

const INVALID = Symbol("invalid");
type Field<T> = T | undefined | typeof INVALID;

// APIs often send null for an absent field. Treat it as absent rather than
// rejecting the whole poll, which used to drop every vault status response
function optionalString(value: unknown): Field<string> {
  if (value === undefined || value === null) return undefined;
  return typeof value === "string" ? value : INVALID;
}

function optionalNumber(value: unknown): Field<number> {
  if (value === undefined || value === null) return undefined;
  return typeof value === "number" ? value : INVALID;
}

/**
 * Validate a poll response and normalise null fields to undefined, so
 * `PollingJobData` describes what callers actually receive. Returns null for a
 * response that does not have the expected shape.
 */
export function parsePollingJobData(value: unknown): PollingJobData | null {
  if (!isRecord(value)) return null;
  const data: PollingJobData = {};

  if (value.job !== undefined && value.job !== null) {
    if (!isRecord(value.job)) return null;
    const status = optionalString(value.job.status);
    const error = optionalString(value.job.error);
    const jobId = optionalString(value.job.jobId);
    if (status === INVALID || error === INVALID || jobId === INVALID) return null;
    data.job = { status, error, jobId };
  }

  if (value.progress !== undefined && value.progress !== null) {
    const progress = value.progress;
    if (
      !isRecord(progress) ||
      typeof progress.completed !== "number" ||
      typeof progress.total !== "number"
    ) {
      return null;
    }
    const percent = optionalNumber(progress.percent);
    if (percent === INVALID) return null;
    data.progress = { completed: progress.completed, total: progress.total, percent };
  }

  const downloadUrl = optionalString(value.downloadUrl);
  if (downloadUrl === INVALID) return null;
  data.downloadUrl = downloadUrl;
  return data;
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
        const data = parsePollingJobData(await res.json());
        if (!active || controller.signal.aborted) return;
        if (!data) {
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
