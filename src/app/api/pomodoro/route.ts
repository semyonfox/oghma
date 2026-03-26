import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth.js';
import sql from '@/database/pgsql.js';
import logger from '@/lib/logger';

/**
 * POST /api/pomodoro
 * Start a new Pomodoro session.
 */
export async function POST(request: Request) {
  try {
    const user = await validateSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { assignment_id, time_block_id, duration_mins, type } = body;

    const [row] = await sql`
      INSERT INTO app.pomodoro_sessions (
        user_id, assignment_id, time_block_id, started_at, duration_mins, type
      ) VALUES (
        ${user.user_id}::uuid, ${assignment_id ?? null},
        ${time_block_id ?? null}, NOW(),
        ${duration_mins ?? 25}, ${type ?? 'focus'}
      )
      RETURNING *
    `;

    return NextResponse.json(row, { status: 201 });
  } catch (err: any) {
    logger.error('pomodoro start error', { error: err?.message ?? err });
    return NextResponse.json({ error: 'Failed to start session' }, { status: 500 });
  }
}

/**
 * PATCH /api/pomodoro
 * Complete/end a Pomodoro session. Increments assignment logged_hours if completed.
 */
export async function PATCH(request: Request) {
  try {
    const user = await validateSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { id, completed } = body;

    if (!id) return NextResponse.json({ error: 'Session id required' }, { status: 400 });

    // update session and conditionally increment assignment logged_hours in a transaction
    const result = await sql.begin(async (tx: any) => {
      const [session] = await tx`
        UPDATE app.pomodoro_sessions SET
          ended_at = NOW(),
          completed = ${completed ?? false}
        WHERE id = ${id}::uuid AND user_id = ${user.user_id}::uuid
        RETURNING *
      `;

      if (!session) return null;

      // increment logged hours on the assignment if this was a completed focus session
      if (completed && session.type === 'focus' && session.assignment_id) {
        const hoursToAdd = (session.duration_mins || 25) / 60;
        await tx`
          UPDATE app.assignments
          SET logged_hours = logged_hours + ${hoursToAdd}
          WHERE id = ${session.assignment_id}::uuid
        `;
      }

      return session;
    });

    if (!result) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    return NextResponse.json(result);
  } catch (err: any) {
    logger.error('pomodoro complete error', { error: err?.message ?? err });
    return NextResponse.json({ error: 'Failed to complete session' }, { status: 500 });
  }
}
