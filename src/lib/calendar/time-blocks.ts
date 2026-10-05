const POMODORO_BLOCK_MINUTES = 30;

/**
 * Calendar blocks include a 25-minute focus period and its five-minute break.
 * Routes validate the range before calling this helper.
 */
export function pomodoroCountForRange(start: Date, end: Date): number {
  const durationMinutes = (end.getTime() - start.getTime()) / 60_000;
  return Math.max(1, Math.ceil(durationMinutes / POMODORO_BLOCK_MINUTES));
}
