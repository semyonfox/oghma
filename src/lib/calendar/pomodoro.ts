// the client starts its timer before the start request lands, so the server
// sees a slightly shorter session than the user did
const START_LATENCY_GRACE_MINUTES = 1;

/**
 * Minutes a completed focus session adds to the assignment's logged hours.
 * Capped by wall-clock time on the server so a client can't log a 25-minute
 * pomodoro seconds after starting it.
 */
export function creditedFocusMinutes(
  startedAt: Date | string,
  endedAt: Date | string,
  durationMins: number,
): number {
  const elapsedMinutes =
    (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60_000;
  if (!Number.isFinite(elapsedMinutes) || durationMins <= 0) return 0;
  return Math.min(
    durationMins,
    Math.max(0, elapsedMinutes + START_LATENCY_GRACE_MINUTES),
  );
}
