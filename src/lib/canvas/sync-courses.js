import {
  canvasIdForBigintColumn,
  normalizeCanvasCourseSelection,
} from "./id.js";

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
