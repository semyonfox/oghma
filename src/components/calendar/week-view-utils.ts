import { formatDateKey } from "@/lib/notes/utils/calendar-date";

export const WEEK_START_HOUR = 6;
export const WEEK_END_HOUR = 24;
const MIN_BLOCK_HEIGHT = 14;

// wall-clock hours, so DST days still line up with the hour labels
function hourOfDay(date: Date): number {
  return date.getHours() + date.getMinutes() / 60;
}

function clampHour(hour: number): number {
  return Math.min(WEEK_END_HOUR, Math.max(WEEK_START_HOUR, hour));
}

/**
 * Pixel offset of a point in time on the week grid. Times before the first
 * visible hour (Canvas often uses 00:00 deadlines) pin to the top instead of
 * rendering above the grid.
 */
export function weekGridOffset(date: Date, hourHeight: number): number {
  return (clampHour(hourOfDay(date)) - WEEK_START_HOUR) * hourHeight;
}

/**
 * Position of a block in its start day's column. A block that runs past
 * midnight is cut at the end of that day.
 */
export function weekGridBlockPosition(
  start: Date,
  end: Date,
  hourHeight: number,
): { top: number; height: number } {
  const startHour = clampHour(hourOfDay(start));
  const endHour =
    formatDateKey(end) === formatDateKey(start)
      ? clampHour(hourOfDay(end))
      : WEEK_END_HOUR;
  return {
    top: (startHour - WEEK_START_HOUR) * hourHeight,
    height: Math.max((endHour - startHour) * hourHeight, MIN_BLOCK_HEIGHT),
  };
}
