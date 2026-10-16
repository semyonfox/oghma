import { ApiError } from "@/lib/api-errors";

const POMODORO_BLOCK_MINUTES = 30;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

// a study block longer than a day is a client bug, not a plan
export const MAX_TIME_BLOCK_MS = DAY_MS;
// the month grid asks for 42 days; leave headroom without allowing unbounded scans
export const MAX_TIME_BLOCK_RANGE_MS = 100 * DAY_MS;
export const MAX_TIME_BLOCKS_PER_RANGE = 1000;

/**
 * Calendar blocks include a 25-minute focus period and its five-minute break.
 * Routes validate the range before calling this helper.
 */
export function pomodoroCountForRange(start: Date, end: Date): number {
  const durationMinutes = (end.getTime() - start.getTime()) / MINUTE_MS;
  return Math.max(1, Math.ceil(durationMinutes / POMODORO_BLOCK_MINUTES));
}

export function assertValidTimeBlockSpan(start: Date, end: Date): void {
  const duration = end.getTime() - start.getTime();
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new ApiError(400, "End must be after start");
  }
  if (duration > MAX_TIME_BLOCK_MS) {
    throw new ApiError(400, "Study blocks can be at most 24 hours long");
  }
}

export function assertValidTimeBlockQueryRange(start: Date, end: Date): void {
  if (end.getTime() - start.getTime() > MAX_TIME_BLOCK_RANGE_MS) {
    throw new ApiError(400, "Date range can be at most 100 days");
  }
}
