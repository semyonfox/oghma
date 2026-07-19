import { NextResponse } from "next/server";
import { withErrorHandler, requireAuth, ApiError } from "@/lib/api-error";
import sql from "@/database/pgsql.js";

/**
 * GET /api/assignments
 * List assignments with optional status/course filters.
 */
export const GET = withErrorHandler(async (request) => {
  const user = await requireAuth();

  const url = new URL(request.url);
  const searchParams = url.searchParams;
  const status = searchParams.get("status");
  const course = searchParams.get("course");
  const includeAll = searchParams.get("all") === "1";
  const includeArchived = searchParams.get("includeArchived") === "1";
  const windowDaysParam = Number(url.searchParams.get("windowDays") ?? "120");
  const windowDays = Number.isFinite(windowDaysParam)
    ? Math.min(Math.max(windowDaysParam, 1), 730)
    : 120;
  const cutoffIso = new Date(Date.now() - windowDays * 86400000).toISOString();

  // build WHERE dynamically instead of 8 separate query branches
  // note: ucs.is_active IS NULL means the course has no settings row (visible by default)
  const effectiveStatus = sql`CASE
    WHEN a.status <> 'done' AND a.due_at IS NOT NULL AND a.due_at < NOW() THEN 'late'
    WHEN a.status = 'late' AND (a.due_at IS NULL OR a.due_at >= NOW()) THEN 'upcoming'
    ELSE a.status
  END`;
  const conditions = [sql`a.user_id = ${user.user_id}::uuid`];
  if (status) conditions.push(sql`${effectiveStatus} = ${status}`);
  if (course) conditions.push(sql`a.course_name = ${course}`);
  if (!includeAll) {
    conditions.push(sql`(
      a.source <> 'canvas'
      OR a.status IN ('upcoming', 'in_progress')
      OR a.due_at >= ${cutoffIso}::timestamptz
      OR a.submitted_at >= ${cutoffIso}::timestamptz
    )`);
  }
  if (!includeArchived) {
    conditions.push(sql`(ucs.is_active IS NULL OR ucs.is_active = true)`);
  }

  const where = conditions.reduce((a, c) => sql`${a} AND ${c}`);
  const rows = await sql`
    SELECT a.id, a.user_id, a.canvas_course_id, a.canvas_assignment_id,
           a.title, a.description, a.course_name, a.course_color,
           a.due_at, a.estimated_hours, a.logged_hours, a.source,
           ${effectiveStatus} AS status,
           a.submitted_at, a.score, a.points_possible,
           a.created_at, a.updated_at
    FROM app.assignments a
    LEFT JOIN app.user_course_settings ucs
      ON ucs.user_id = ${user.user_id}::uuid
      AND ucs.canvas_course_id = a.canvas_course_id
    WHERE ${where}
    ORDER BY due_at ASC NULLS LAST, created_at DESC
  `;

  return NextResponse.json(rows);
});

/**
 * POST /api/assignments
 * Create a manual assignment/task.
 */
export const POST = withErrorHandler(async (request) => {
  const user = await requireAuth();

  const body = await request.json();
  const {
    title,
    course_name,
    course_color,
    due_at,
    estimated_hours,
    description,
  } = body;

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    throw new ApiError(400, "Title is required");
  }

  const dueDate = due_at ? new Date(due_at) : null;
  const initialStatus =
    dueDate && !Number.isNaN(dueDate.getTime()) && dueDate.getTime() < Date.now()
      ? "late"
      : "upcoming";

  const [row] = await sql`
    INSERT INTO app.assignments (
      user_id, title, description, course_name, course_color,
      due_at, estimated_hours, source, status
    ) VALUES (
      ${user.user_id}::uuid, ${title.trim()}, ${description ?? null},
      ${course_name ?? null}, ${course_color ?? null},
      ${due_at ?? null}, ${estimated_hours ?? null}, 'manual', ${initialStatus}
    )
    RETURNING id, user_id, canvas_course_id, canvas_assignment_id,
              title, description, course_name, course_color,
              due_at, estimated_hours, logged_hours, source, status,
              submitted_at, score, points_possible,
              created_at, updated_at
  `;

  return NextResponse.json(row, { status: 201 });
});
