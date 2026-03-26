import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth.js';
import sql from '@/database/pgsql.js';
import logger from '@/lib/logger';

/**
 * GET /api/time-blocks?start=ISO&end=ISO
 * List time blocks in a date range.
 */
export async function GET(request: Request) {
  try {
    const user = await validateSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(request.url);
    const start = url.searchParams.get('start');
    const end = url.searchParams.get('end');

    if (!start || !end) {
      return NextResponse.json({ error: 'start and end params required' }, { status: 400 });
    }

    const rows = await sql`
      SELECT tb.*, a.title AS assignment_title, a.course_name, a.course_color
      FROM app.time_blocks tb
      LEFT JOIN app.assignments a ON a.id = tb.assignment_id
      WHERE tb.user_id = ${user.user_id}::uuid
        AND tb.starts_at < ${end}::timestamptz
        AND tb.ends_at > ${start}::timestamptz
      ORDER BY tb.starts_at ASC
    `;

    return NextResponse.json(rows);
  } catch (err: any) {
    logger.error('time-blocks list error', { error: err?.message ?? err });
    return NextResponse.json({ error: 'Failed to fetch time blocks' }, { status: 500 });
  }
}

/**
 * POST /api/time-blocks
 * Create a time block. Auto-calculates pomodoro_count from duration.
 */
export async function POST(request: Request) {
  try {
    const user = await validateSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { assignment_id, title, starts_at, ends_at } = body;

    if (!starts_at || !ends_at) {
      return NextResponse.json({ error: 'starts_at and ends_at required' }, { status: 400 });
    }

    const start = new Date(starts_at);
    const end = new Date(ends_at);
    const durationMins = (end.getTime() - start.getTime()) / 60000;

    if (durationMins <= 0) {
      return NextResponse.json({ error: 'End must be after start' }, { status: 400 });
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
  } catch (err: any) {
    logger.error('time-block create error', { error: err?.message ?? err });
    return NextResponse.json({ error: 'Failed to create time block' }, { status: 500 });
  }
}
