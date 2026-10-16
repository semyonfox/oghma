/**
 * Canvas assignment metadata sync
 *
 * Mirrors assignment metadata (title, due date, submission, score) from Canvas
 * into app.assignments for the tracker. File downloads belong to the import
 * pipeline, not this module.
 *
 * Called from:
 *   - Canvas course discovery/processing during background imports
 *   - /api/assignments/sync for on-demand syncs
 */

import logger from "@/lib/logger";
import sql from "@/database/pgsql";
import { withCanvasPublication } from "./execution";
import { canvasIdForBigintColumn } from "./id";
import type { CanvasAssignment } from "./client";
import { createAsyncLimiter } from "./async-limiter";

interface AssignmentClient {
  getAssignments(courseId: string): Promise<{
    data: CanvasAssignment[];
    forbidden?: boolean;
    error?: string;
  }>;
}

interface SyncAssignmentOptions {
  // set when knownAssignments is the full Canvas list for the course, not a
  // partial page set from a failed or restricted read
  complete?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// deterministic color palette for course badges
const COURSE_COLORS = [
  "#7c3aed", // purple
  "#f59e0b", // amber
  "#06b6d4", // cyan
  "#ef4444", // red
  "#22c55e", // green
  "#ec4899", // pink
  "#3b82f6", // blue
  "#f97316", // orange
  "#8b5cf6", // violet
  "#14b8a6", // teal
];

function hashString(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function deriveStatus(assignment: CanvasAssignment) {
  const submission = assignment.submission;
  const ws = submission?.workflow_state;
  if (submission?.submitted_at || ws === "submitted" || ws === "graded") {
    return "done";
  }
  if (assignment.due_at && new Date(assignment.due_at) < new Date()) {
    return "late";
  }
  return "upcoming";
}

function isSubmitted(assignment: Record<string, unknown>) {
  const submission = isRecord(assignment.submission) ? assignment.submission : undefined;
  const ws = submission?.workflow_state;
  return !!(submission?.submitted_at || ws === "submitted" || ws === "graded");
}

export function deriveAssignmentType(assignment: unknown) {
  if (!isRecord(assignment)) return "unknown";

  if (assignment.is_quiz_assignment === true) return "quiz";

  const submissionTypes = Array.isArray(assignment.submission_types)
    ? assignment.submission_types
    : [];
  if (submissionTypes.some((type) => type === "online_quiz" || type === "quiz")) {
    return "quiz";
  }

  if (submissionTypes.length > 0) return "assignment";

  return "unknown";
}

export function shouldSyncAssignment(assignment: unknown) {
  if (!isRecord(assignment)) return false;
  if (assignment.locked_for_user === true) return false;
  if (assignment.published === false) return false;
  if (!assignment.due_at && !isSubmitted(assignment)) return false;
  return true;
}

export async function syncAssignmentMetadata(
  courseId: string,
  userId: string,
  courseTitle: string,
  client: AssignmentClient,
  knownAssignments?: CanvasAssignment[],
  options: SyncAssignmentOptions = {},
) {
  const fetched = knownAssignments
    ? { data: knownAssignments, forbidden: false, error: undefined }
    : await client.getAssignments(courseId);

  if (fetched.error || fetched.forbidden || !fetched.data) {
    logger.warn("worker_event");
    return { synced: 0, errors: 1, removed: 0 };
  }
  const assignments = fetched.data;
  // a self-fetched list is complete because the client reports any failed page
  const complete = knownAssignments ? options.complete === true : true;
  const canvasCourseId = canvasIdForBigintColumn(courseId, "Canvas course ID");

  const courseColor =
    COURSE_COLORS[hashString(courseTitle) % COURSE_COLORS.length];
  const limit = createAsyncLimiter(4);
  const results = await Promise.all(assignments.filter(shouldSyncAssignment).map((a) => limit(async () => {
    try {
      const status = deriveStatus(a);
      const assignmentType = deriveAssignmentType(a);
      const submission = a.submission;

      // tracker progress the user set (in progress, or done for work handed
      // in outside Canvas) survives a sync unless Canvas itself says done
      await withCanvasPublication(() => sql`
        INSERT INTO app.assignments (
          user_id, canvas_course_id, canvas_assignment_id,
          title, description, course_name, course_color,
          due_at, status, source, assignment_type,
          submitted_at, score, points_possible
        ) VALUES (
          ${userId}::uuid, ${canvasCourseId}::bigint, ${canvasIdForBigintColumn(a.id, "Canvas assignment ID")}::bigint,
          ${a.name}, ${a.description ?? null}, ${courseTitle}, ${courseColor},
          ${a.due_at ?? null}, ${status}, 'canvas', ${assignmentType},
          ${submission?.submitted_at ?? null},
          ${submission?.score ?? null},
          ${a.points_possible ?? null}
        )
        ON CONFLICT (user_id, canvas_assignment_id)
          WHERE canvas_assignment_id IS NOT NULL
        DO UPDATE SET
          title = EXCLUDED.title,
          course_name = EXCLUDED.course_name,
          course_color = EXCLUDED.course_color,
          due_at = EXCLUDED.due_at,
          status = CASE
            WHEN EXCLUDED.status = 'done' THEN EXCLUDED.status
            WHEN app.assignments.status IN ('in_progress', 'done') THEN app.assignments.status
            ELSE EXCLUDED.status
          END,
          submitted_at = EXCLUDED.submitted_at,
          score = EXCLUDED.score,
          points_possible = EXCLUDED.points_possible,
          assignment_type = EXCLUDED.assignment_type,
          updated_at = NOW()
      `);
      return true;
    } catch {
      logger.error("worker_event");
      return false;
    }
  })));
  const errors = results.filter((ok) => !ok).length;

  // Canvas never lists deleted or unpublished assignments to students, so a
  // row missing from a complete list is gone. Locked or undated ones are
  // still listed and only skipped above, so they are kept. Time blocks and
  // focus sessions that pointed at a removed row fall back to unlinked.
  let removed = 0;
  if (complete && errors === 0) {
    const listedIds = assignments.map((a) =>
      canvasIdForBigintColumn(a.id, "Canvas assignment ID"));
    const rows = await withCanvasPublication(() => sql`
      DELETE FROM app.assignments
      WHERE user_id = ${userId}::uuid
        AND source = 'canvas'
        AND canvas_course_id = ${canvasCourseId}::bigint
        AND NOT (canvas_assignment_id = ANY(${listedIds}::bigint[]))
      RETURNING id
    `);
    removed = rows.length;
  }

  return { synced: results.length - errors, errors, removed };
}
