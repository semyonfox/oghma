/**
 * Canvas Assignment Metadata Sync
 *
 * Fetches assignment metadata (title, due dates, scores) from Canvas
 * and upserts into app.assignments. Does NOT download files — that's
 * handled separately by the import worker's processAssignments().
 *
 * Called from:
 *   - Canvas course discovery/processing during background imports
 *   - /api/assignments/sync route for on-demand syncs
 */

import sql from "../../database/pgsql";
import { canvasIdForBigintColumn } from "./id";
import type { CanvasAssignment } from "./client";

interface AssignmentClient {
  getAssignments(courseId: string): Promise<{
    data: CanvasAssignment[];
    error?: string;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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
) {
  const { data: assignments, error } = await client.getAssignments(courseId);

  if (error || !assignments) {
    console.warn(
      `[sync-assignments] failed to fetch assignments for course ${courseId}: ${error}`,
    );
    return { synced: 0, errors: 1 };
  }

  const courseColor =
    COURSE_COLORS[hashString(courseTitle) % COURSE_COLORS.length];
  let synced = 0;
  let errors = 0;

  for (const a of assignments) {
    if (!shouldSyncAssignment(a)) continue;
    try {
      const status = deriveStatus(a);
      const assignmentType = deriveAssignmentType(a);
      const submission = a.submission;

      await sql`
        INSERT INTO app.assignments (
          user_id, canvas_course_id, canvas_assignment_id,
          title, description, course_name, course_color,
          due_at, status, source, assignment_type,
          submitted_at, score, points_possible
        ) VALUES (
          ${userId}::uuid, ${canvasIdForBigintColumn(courseId, "Canvas course ID")}::bigint, ${canvasIdForBigintColumn(a.id, "Canvas assignment ID")}::bigint,
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
            WHEN app.assignments.status = 'in_progress' THEN app.assignments.status
            ELSE EXCLUDED.status
          END,
          submitted_at = EXCLUDED.submitted_at,
          score = EXCLUDED.score,
          points_possible = EXCLUDED.points_possible,
          assignment_type = EXCLUDED.assignment_type,
          updated_at = NOW()
      `;
      synced++;
    } catch (err) {
      console.error(
        `[sync-assignments] failed to upsert assignment ${a.id}: ${errorMessage(err)}`,
      );
      errors++;
    }
  }

  return { synced, errors };
}
