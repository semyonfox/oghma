import { NextResponse } from 'next/server';
import { withErrorHandler, requireAuth, requireValidId, tracedError, ApiError } from '@/lib/api-error';
import sql from '@/database/pgsql.js';
import { timeBlockUpdateSchema, validateBody } from '@/lib/validations/schemas';

/**
 * PATCH /api/time-blocks/:id
 * Move or resize a time block.
 */
export const PATCH = withErrorHandler(async (request, context: any) => {
  const user = await requireAuth();

  const { id } = await context.params;
  requireValidId(id);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw new ApiError(400, 'Invalid JSON body');
  }
  const validation = validateBody(timeBlockUpdateSchema, rawBody);
  if (!validation.success) return validation.response;
  const { starts_at, ends_at, assignment_id, title, completed } = validation.data;

  let pomodoroCount: number | undefined;
  if (starts_at || ends_at) {
    const [existing] = await sql`
      SELECT starts_at, ends_at FROM app.time_blocks
      WHERE id = ${id}::uuid AND user_id = ${user.user_id}::uuid
    `;
    if (!existing) return tracedError('Not found', 404);
    const start = new Date(starts_at ?? existing.starts_at);
    const end = new Date(ends_at ?? existing.ends_at);
    if (end.getTime() <= start.getTime()) {
      throw new ApiError(400, 'End must be after start');
    }
    pomodoroCount = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 60000 / 30));
  }

  // verify new assignment_id belongs to the caller before linking (I3)
  if (assignment_id) {
    const [owned] = await sql`
      SELECT 1 FROM app.assignments
      WHERE id = ${assignment_id}::uuid AND user_id = ${user.user_id}::uuid
    `;
    if (!owned) {
      return tracedError('assignment_id does not belong to you', 403);
    }
  }

  const updates: Record<string, unknown> = {};
  if (starts_at !== undefined) updates.starts_at = starts_at;
  if (ends_at !== undefined) updates.ends_at = ends_at;
  if (assignment_id !== undefined) updates.assignment_id = assignment_id;
  if (title !== undefined) updates.title = title;
  if (pomodoroCount !== undefined) updates.pomodoro_count = pomodoroCount;
  if (completed !== undefined) updates.completed = completed;
  updates.updated_at = new Date();

  const result = await sql`
    UPDATE app.time_blocks SET ${sql(updates, ...Object.keys(updates))}
    WHERE id = ${id}::uuid AND user_id = ${user.user_id}::uuid
    RETURNING *
  `;

  if (result.length === 0) return tracedError('Not found', 404);
  return NextResponse.json(result[0]);
});

/**
 * DELETE /api/time-blocks/:id
 */
export const DELETE = withErrorHandler(async (_request, context: any) => {
  const user = await requireAuth();

  const { id } = await context.params;
  requireValidId(id);

  const result = await sql`
    DELETE FROM app.time_blocks
    WHERE id = ${id}::uuid AND user_id = ${user.user_id}::uuid
    RETURNING id
  `;

  if (result.length === 0) return tracedError('Not found', 404);
  return NextResponse.json({ deleted: true });
});
