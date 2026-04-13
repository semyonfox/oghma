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
  const cutoffIso = new Date(
    Date.now() - windowDays * 86400000,
  ).toISOString();

  // build WHERE dynamically instead of 8 separate query branches
  const conditions = [sql`user_id = ${user.user_id}::uuid`];
  if (status) conditions.push(sql`status = ${status}`);
  if (course) conditions.push(sql`course_name = ${course}`);
  if (!includeAll) {
    conditions.push(sql`(
      source <> 'canvas'
      OR status IN ('upcoming', 'in_progress')
      OR due_at >= ${cutoffIso}::timestamptz
      OR submitted_at >= ${cutoffIso}::timestamptz
    )`);
  }

  const where = conditions.reduce((a, c) => sql`${a} AND ${c}`);
  const rows = await sql`
    SELECT a.* FROM app.assignments a
    LEFT JOIN app.user_course_settings ucs 
      ON ucs.user_id = ${user.user_id}::uuid 
      AND ucs.canvas_course_id = a.canvas_course_id
    WHERE ${where}
    ${!includeArchived ? sql`AND (ucs.is_active IS NULL OR ucs.is_active = true)` : sql``}
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

  const [row] = await sql`
    INSERT INTO app.assignments (
      user_id, title, description, course_name, course_color,
      due_at, estimated_hours, source
    ) VALUES (
      ${user.user_id}::uuid, ${title.trim()}, ${description ?? null},
      ${course_name ?? null}, ${course_color ?? null},
      ${due_at ?? null}, ${estimated_hours ?? null}, 'manual'
    )
    RETURNING *
  `;

  return NextResponse.json(row, { status: 201 });
});
