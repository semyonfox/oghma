/**
 * Canvas Assignment Metadata Sync
 *
 * Fetches assignment metadata (title, due dates, scores) from Canvas
 * and upserts into app.assignments. Does NOT download files — that's
 * handled separately by the import worker's processAssignments().
 *
 * Called from:
 *   - import-worker.js processCourse() during background syncs
 *   - /api/assignments/sync route for on-demand syncs
 */

import sql from "../../database/pgsql.js";

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

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function deriveStatus(assignment) {
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

/**
 * Sync assignment metadata for a single course.
 *
 * @param {string} courseId - Canvas course ID
 * @param {string} userId - Oghma user UUID
 * @param {string} courseTitle - cleaned course title for display
 * @param {import('./client.js').CanvasClient} client - authenticated Canvas client
 * @returns {Promise<{ synced: number, errors: number }>}
 */
export async function syncAssignmentMetadata(
  courseId,
  userId,
  courseTitle,
  client,
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
    try {
      const status = deriveStatus(a);
      const submission = a.submission;

      await sql`
        INSERT INTO app.assignments (
          user_id, canvas_course_id, canvas_assignment_id,
          title, description, course_name, course_color,
          due_at, status, source,
          submitted_at, score, points_possible
        ) VALUES (
          ${userId}::uuid, ${Number(courseId)}, ${a.id},
          ${a.name}, ${a.description ?? null}, ${courseTitle}, ${courseColor},
          ${a.due_at ?? null}, ${status}, 'canvas',
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
          updated_at = NOW()
      `;
      synced++;
    } catch (err) {
      console.error(
        `[sync-assignments] failed to upsert assignment ${a.id}: ${err.message}`,
      );
      errors++;
    }
  }

  return { synced, errors };
}
