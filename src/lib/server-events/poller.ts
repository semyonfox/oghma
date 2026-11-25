"use client";

export interface Poller {
  /** run the next tick soon, no sooner than minGapMs after the last one started */
  nudge(): void;
  stop(): void;
}

/**
 * Runs tick after firstDelayMs (null waits for a nudge), then after each
 * delay it returns, or never for null.
 * Ticks never overlap, and a hidden tab owes its next tick until it is
 * visible again instead of fetching in the background.
 */
export function createPoller(
  tick: () => Promise<number | null>,
  minGapMs: number,
  firstDelayMs: number | null = 0,
): Poller {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;
  let owed = false;
  let stopped = false;
  let lastStart = Number.NEGATIVE_INFINITY;

  const after = (delay: number) => {
    clearTimeout(timer);
    timer = setTimeout(fire, Math.max(0, delay));
  };

  function fire() {
    timer = undefined;
    if (stopped) return;
    if (busy || document.hidden) {
      owed = true;
      return;
    }
    owed = false;
    busy = true;
    lastStart = Date.now();
    void tick()
      .catch(() => null)
      .then((delay) => {
        busy = false;
        if (stopped) return;
        if (owed) after(lastStart + minGapMs - Date.now());
        else if (delay !== null) after(delay);
      });
  }

  const onVisibility = () => {
    if (!document.hidden && owed && !busy) fire();
  };
  document.addEventListener("visibilitychange", onVisibility);
  if (firstDelayMs !== null) after(firstDelayMs);

  return {
    nudge() {
      if (stopped) return;
      if (busy) {
        owed = true;
        return;
      }
      after(lastStart + minGapMs - Date.now());
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}
