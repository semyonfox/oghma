import { NextResponse } from 'next/server';
import type postgres from 'postgres';
import { withErrorHandler, requireAuth, ApiError, parseJsonObject, tracedError } from '@/lib/api-error';
import { pomodoroEndSchema, pomodoroStartSchema, validateBody } from '@/lib/validations/schemas';
import sql from '@/database/pgsql';
import { creditedFocusMinutes } from '@/lib/calendar/pomodoro';

interface PomodoroSessionRow {
  assignment_id: string | null;
  duration_mins: number;
  type: string;
  started_at: Date | string;
  ended_at: Date | string | null;
}

/**
 * POST /api/pomodoro
 * Start a new Pomodoro session.
 */
export const POST = withErrorHandler(async (request) => {
  const user = await requireAuth();

  const parsed = validateBody(pomodoroStartSchema, await parseJsonObject(request));
  if (!parsed.success) return parsed.response;
  const { assignment_id, time_block_id, duration_mins, type } = parsed.data;

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
 * End a Pomodoro session. A completed focus session adds its time to the
 * linked assignment's logged_hours. Ending an already-ended session is a no-op,
 * so retries and duplicate tabs can't log the same pomodoro twice.
 */
export const PATCH = withErrorHandler(async (request) => {
  const user = await requireAuth();

  const parsed = validateBody(pomodoroEndSchema, await parseJsonObject(request));
  if (!parsed.success) return parsed.response;
  const { id, completed } = parsed.data;

  const result = await sql.begin(async (tx: postgres.TransactionSql) => {
    const [ended] = await tx<PomodoroSessionRow[]>`
      UPDATE app.pomodoro_sessions SET
        ended_at = NOW(),
        completed = ${completed ?? false}
      WHERE id = ${id}::uuid AND user_id = ${user.user_id}::uuid
        AND ended_at IS NULL
      RETURNING *
    `;

    if (!ended) {
      const [existing] = await tx<PomodoroSessionRow[]>`
        SELECT * FROM app.pomodoro_sessions
        WHERE id = ${id}::uuid AND user_id = ${user.user_id}::uuid
      `;
      return existing ?? null;
    }

    // scope the UPDATE to user_id to prevent cross-user write (C1 class)
    if (completed && ended.type === 'focus' && ended.assignment_id && ended.ended_at) {
      const minutes = creditedFocusMinutes(ended.started_at, ended.ended_at, ended.duration_mins);
      if (minutes > 0) {
        await tx`
          UPDATE app.assignments
          SET logged_hours = logged_hours + ${minutes / 60}
          WHERE id = ${ended.assignment_id}::uuid AND user_id = ${user.user_id}::uuid
        `;
      }
    }

    return ended;
  });

  if (!result) return tracedError('Session not found', 404);
  return NextResponse.json(result);
});
