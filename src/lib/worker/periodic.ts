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
 */
export function startPeriodicTask(
  name: string,
  work: () => Promise<unknown>,
  intervalMs: number,
  options: { runNow?: boolean } = {},
): PeriodicTask {
  let running: Promise<void> | null = null;
  let stopped = false;

  const trigger = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    if (running) return running;
    running = (async () => {
      try {
        await work();
      } catch (error) {
        logger.error("worker periodic task failed", { task: name, error });
      }
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
