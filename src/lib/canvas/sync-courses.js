import {
  canvasIdForBigintColumn,
  normalizeCanvasCourseSelection,
} from "./id.js";
import { pooled } from "./async-limiter.js";

// Course-list responses intentionally omit some concluded or otherwise hidden
// enrolments.  Keep this low because Canvas applies per-user rate limits.
const HISTORICAL_COURSE_LOOKUP_CONCURRENCY = 4;

/**
 * Combine Canvas's current course list with courses this user has imported
 * before. Canvas can still allow a direct `/courses/:id` request even when it
 * no longer returns that course from `/courses`, so do not make the picker
 * depend solely on enrolment-list visibility.
 *
 * Only directly accessible historical courses are returned. This deliberately
 * does not make deleted or permission-revoked courses look importable.
 */
export async function resolveAccessibleCanvasCourses(
  client,
  visibleCourses = [],
  previousCourseIds = [],
) {
  const courses = [];
  const seen = new Set();

  for (const course of visibleCourses ?? []) {
    const id = canvasIdForBigintColumn(course?.id, "Canvas course ID");
    if (seen.has(id)) continue;
    courses.push({ ...course, id });
    seen.add(id);
  }

  const missingIds = [];
  for (const rawId of previousCourseIds ?? []) {
    const id = canvasIdForBigintColumn(rawId, "Canvas course ID");
    if (!seen.has(id) && !missingIds.includes(id)) missingIds.push(id);
  }

  const results = await pooled(
    missingIds.map((id) => async () => ({ id, result: await client.getCourse(id) })),
    HISTORICAL_COURSE_LOOKUP_CONCURRENCY,
  );

  for (const outcome of results) {
    if (outcome.status !== "fulfilled") continue;
    const { id: requestedId, result } = outcome.value;
    if (!result?.data) continue;

    const id = canvasIdForBigintColumn(result.data.id, "Canvas course ID");
    // A response for a different course must never be attached to the
    // historical import record we asked Canvas to resolve.
    if (id !== requestedId || seen.has(id)) continue;
    courses.push({ ...result.data, id, historical: true });
    seen.add(id);
  }

  return courses;
}

/**
 * Match visible Canvas courses to the IDs already imported by a user. Missing
 * courses remain in the sync as string-ID fallbacks so archived/restricted
 * courses are never rounded or silently dropped.
 */
export function buildCanvasSyncCourses(previousCourseIds, visibleCourses = []) {
  const desiredIds = [...previousCourseIds].map((id) =>
    canvasIdForBigintColumn(id, "Canvas course ID"),
  );
  const desired = new Set(desiredIds);
  const matched = new Set();
  const courses = [];

  for (const course of visibleCourses ?? []) {
    const id = canvasIdForBigintColumn(course?.id, "Canvas course ID");
    if (!desired.has(id) || matched.has(id)) continue;
    courses.push(normalizeCanvasCourseSelection(course));
    matched.add(id);
  }

  for (const id of desiredIds) {
    if (!matched.has(id)) courses.push(normalizeCanvasCourseSelection(id));
  }

  return courses;
}
