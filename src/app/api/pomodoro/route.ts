import { NextResponse } from 'next/server';
import { withErrorHandler, requireAuth, ApiError, tracedError } from '@/lib/api-error';
import sql from '@/database/pgsql.js';

/**
 * POST /api/pomodoro
 * Start a new Pomodoro session.
 */
export const POST = withErrorHandler(async (request) => {
  const user = await requireAuth();

  const body = await request.json();
  const { assignment_id, time_block_id, duration_mins, type } = body;

  // verify assignment_id belongs to the caller before linking (I3)
  if (assignment_id) {
    const [owned] = await sql`
      SELECT 1 FROM app.assignments
      WHERE id = ${assignment_id}::uuid AND user_id = ${user.user_id}::uuid
    `;
    if (!owned) throw new ApiError(403, 'assignment_id does not belong to you');
  }

  // verify time_block_id belongs to the caller before linking (I3)
  if (time_block_id) {
    const [owned] = await sql`
      SELECT 1 FROM app.time_blocks
      WHERE id = ${time_block_id}::uuid AND user_id = ${user.user_id}::uuid
    `;
    if (!owned) throw new ApiError(403, 'time_block_id does not belong to you');
  }

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
});

/**
 * PATCH /api/pomodoro
 * Complete/end a Pomodoro session. Increments assignment logged_hours if completed.
 */
export const PATCH = withErrorHandler(async (request) => {
  const user = await requireAuth();

  const body = await request.json();
  const { id, completed } = body;

  if (!id) throw new ApiError(400, 'Session id required');

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
    // scope the UPDATE to user_id to prevent cross-user write (C1 class)
    if (completed && session.type === 'focus' && session.assignment_id) {
      const hoursToAdd = (session.duration_mins || 25) / 60;
      await tx`
        UPDATE app.assignments
        SET logged_hours = logged_hours + ${hoursToAdd}
        WHERE id = ${session.assignment_id}::uuid AND user_id = ${user.user_id}::uuid
      `;
    }

    return session;
  });

  if (!result) return tracedError('Session not found', 404);
  return NextResponse.json(result);
});
