import { NextResponse } from 'next/server';
import { withErrorHandler, requireAuth, ApiError } from '@/lib/api-error';
import sql from '@/database/pgsql.js';

/**
 * GET /api/time-blocks?start=ISO&end=ISO
 * List time blocks in a date range.
 */
export const GET = withErrorHandler(async (request) => {
  const user = await requireAuth();

  const url = new URL(request.url);
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');

  if (!start || !end) {
    throw new ApiError(400, 'start and end params required');
  }

  const rows = await sql`
    SELECT tb.*, a.title AS assignment_title, a.course_name, a.course_color
    FROM app.time_blocks tb
    LEFT JOIN app.assignments a ON a.id = tb.assignment_id AND a.user_id = ${user.user_id}::uuid
    WHERE tb.user_id = ${user.user_id}::uuid
      AND tb.starts_at < ${end}::timestamptz
      AND tb.ends_at > ${start}::timestamptz
    ORDER BY tb.starts_at ASC
  `;

  return NextResponse.json(rows);
});

/**
 * POST /api/time-blocks
 * Create a time block. Auto-calculates pomodoro_count from duration.
 */
export const POST = withErrorHandler(async (request) => {
  const user = await requireAuth();

  const body = await request.json();
  const { assignment_id, title, starts_at, ends_at } = body;

  if (!starts_at || !ends_at) {
    throw new ApiError(400, 'starts_at and ends_at required');
  }

  const start = new Date(starts_at);
  const end = new Date(ends_at);
  const durationMins = (end.getTime() - start.getTime()) / 60000;

  if (durationMins <= 0) {
    throw new ApiError(400, 'End must be after start');
  }

  // verify assignment_id belongs to the caller before linking (I3)
  if (assignment_id) {
    const [owned] = await sql`
      SELECT 1 FROM app.assignments
      WHERE id = ${assignment_id}::uuid AND user_id = ${user.user_id}::uuid
    `;
    if (!owned) throw new ApiError(403, 'assignment_id does not belong to you');
  }

  // 30-min blocks (25 focus + 5 break)
  const pomodoroCount = Math.max(1, Math.ceil(durationMins / 30));

  const [row] = await sql`
    INSERT INTO app.time_blocks (
      user_id, assignment_id, title, starts_at, ends_at, pomodoro_count
    ) VALUES (
      ${user.user_id}::uuid, ${assignment_id ?? null},
      ${title ?? null}, ${starts_at}, ${ends_at}, ${pomodoroCount}
    )
    RETURNING *
  `;

  return NextResponse.json(row, { status: 201 });
});
