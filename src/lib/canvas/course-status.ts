import sql from "@/database/pgsql";
import logger from "@/lib/logger";
import { canvasIdForBigintColumn } from "./id";
import { CANVAS_COURSE_STATUS } from "./sync-courses";

const STORED_STATUSES = new Set<string>([
  CANVAS_COURSE_STATUS.CURRENT,
  CANVAS_COURSE_STATUS.PAST,
  CANVAS_COURSE_STATUS.PENDING,
  CANVAS_COURSE_STATUS.INACCESSIBLE,
]);

interface DiscoveredCourse {
  id: unknown;
  canvasStatus?: string;
}

/** the statuses worth keeping. an unavailable lookup says nothing about the course */
export function storableCourseStatuses(
  courses: readonly DiscoveredCourse[],
): Array<{ id: string; status: string }> {
  const byId = new Map<string, string>();
  for (const course of courses) {
    if (!course.canvasStatus || !STORED_STATUSES.has(course.canvasStatus)) continue;
    try {
      byId.set(canvasIdForBigintColumn(course.id, "Canvas course ID"), course.canvasStatus);
    } catch {
      // discovery already rejects bad ids, so this only skips a malformed record
    }
  }
  return [...byId].map(([id, status]) => ({ id, status }));
}

/**
 * Remember what Canvas says about each course so the tree can fold finished
 * ones away. This is a display hint, so a failed write is logged and never
 * fails the Canvas request that discovered it.
 */
export async function recordCanvasCourseStatuses(
  userId: string,
  courses: readonly DiscoveredCourse[],
): Promise<void> {
  const rows = storableCourseStatuses(courses);
  if (rows.length === 0) return;
  try {
    await sql`
      INSERT INTO app.canvas_course_status (user_id, canvas_course_id, status)
      SELECT ${userId}::uuid, course.id::bigint, course.status
      FROM unnest(${rows.map((row) => row.id)}::text[], ${rows.map((row) => row.status)}::text[])
        AS course(id, status)
      ON CONFLICT (user_id, canvas_course_id) DO UPDATE
        SET status = EXCLUDED.status, updated_at = NOW()
        WHERE app.canvas_course_status.status IS DISTINCT FROM EXCLUDED.status
    `;
  } catch (error) {
    logger.warn("canvas course status not saved", { error });
  }
}
