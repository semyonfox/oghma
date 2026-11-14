import logger from "@/lib/logger";

export interface PeriodicTask {
  /** Start a run now unless one is already in flight. */
  trigger(): Promise<void>;
  /** Stop future ticks; an in-flight run keeps going. */
  stop(): void;
  /** Resolves once the current run, if any, settles. */
  idle(): Promise<void>;
}

/**
 * Run background maintenance on an interval without overlapping runs.
 *
 * A slow database or a Redis outage can make one pass outlast its interval.
 * Plain setInterval would then stack concurrent passes, and an uncaught
 * rejection from a timer callback terminates the Node process, taking every
 * in-flight job with it. Errors are logged and the next tick tries again.
 * A run that outlasts its interval is logged with its duration, since that is
 * when ticks start being skipped.
 */
export function startPeriodicTask(
  name: string,
  work: () => Promise<unknown>,
  intervalMs: number,
  options: { runNow?: boolean; slowAfterMs?: number } = {},
): PeriodicTask {
  let running: Promise<void> | null = null;
  let stopped = false;
  const slowAfterMs = options.slowAfterMs ?? intervalMs;

  const trigger = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    if (running) return running;
    running = (async () => {
      const started = performance.now();
      try {
        await work();
      } catch (error) {
        logger.error("worker periodic task failed", { task: name, error });
      }
      const durationMs = Math.round(performance.now() - started);
      if (durationMs >= slowAfterMs)
        logger.warn("worker periodic task slow", {
          task: name,
          durationMs,
          intervalMs,
        });
    })().finally(() => {
      running = null;
    });
    return running;
  };

  const timer = setInterval(() => void trigger(), intervalMs);
  timer.unref();
  if (options.runNow) void trigger();

  return {
    trigger,
    stop() {
      stopped = true;
      clearInterval(timer);
    },
    idle() {
      return running ?? Promise.resolve();
    },
  };
}
