import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth.js';
import { isValidUUID } from '@/lib/uuid-validation.js';
import sql from '@/database/pgsql.js';
import logger from '@/lib/logger';

/**
 * PATCH /api/time-blocks/:id
 * Move or resize a time block.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await validateSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    if (!isValidUUID(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

    const body = await request.json();
    const { starts_at, ends_at, assignment_id, title } = body;

    let pomodoroCount: number | undefined;
    if (starts_at && ends_at) {
      const durationMins = (new Date(ends_at).getTime() - new Date(starts_at).getTime()) / 60000;
      pomodoroCount = Math.max(1, Math.ceil(durationMins / 30));
    }

    const result = await sql`
      UPDATE app.time_blocks SET
        starts_at = COALESCE(${starts_at ?? null}, starts_at),
        ends_at = COALESCE(${ends_at ?? null}, ends_at),
        assignment_id = COALESCE(${assignment_id ?? null}, assignment_id),
        title = COALESCE(${title ?? null}, title),
        pomodoro_count = COALESCE(${pomodoroCount ?? null}, pomodoro_count)
      WHERE id = ${id}::uuid AND user_id = ${user.user_id}::uuid
      RETURNING *
    `;

    if (result.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(result[0]);
  } catch (err: any) {
    logger.error('time-block update error', { error: err?.message ?? err });
    return NextResponse.json({ error: 'Failed to update time block' }, { status: 500 });
  }
}

/**
 * DELETE /api/time-blocks/:id
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await validateSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    if (!isValidUUID(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

    const result = await sql`
      DELETE FROM app.time_blocks
      WHERE id = ${id}::uuid AND user_id = ${user.user_id}::uuid
      RETURNING id
    `;

    if (result.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (err: any) {
    logger.error('time-block delete error', { error: err?.message ?? err });
    return NextResponse.json({ error: 'Failed to delete time block' }, { status: 500 });
  }
}
