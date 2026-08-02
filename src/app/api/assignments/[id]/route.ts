import { NextResponse } from 'next/server';
import { withErrorHandler, requireAuth, requireValidId, ApiError, tracedError } from '@/lib/api-error';
import sql from '@/database/pgsql.js';
import { assignmentUpdateSchema, validateBody } from '@/lib/validations/schemas';

/**
 * GET /api/assignments/:id
 */
export const GET = withErrorHandler(async (_request, context: any) => {
  const user = await requireAuth();

  const { id } = await context.params;
  requireValidId(id);

  const [row] = await sql`
    SELECT id, user_id,
           canvas_course_id::text AS canvas_course_id,
           canvas_assignment_id::text AS canvas_assignment_id,
           title, description, course_name, course_color,
           due_at, estimated_hours, logged_hours, source, assignment_type,
           CASE
             WHEN status <> 'done' AND due_at IS NOT NULL AND due_at < NOW() THEN 'late'
             WHEN status = 'late' AND (due_at IS NULL OR due_at >= NOW()) THEN 'upcoming'
             ELSE status
           END AS status,
           submitted_at, score, points_possible,
           created_at, updated_at
    FROM app.assignments
    WHERE id = ${id}::uuid AND user_id = ${user.user_id}::uuid
  `;

  if (!row) return tracedError('Not found', 404);
  return NextResponse.json(row);
});

/**
 * PATCH /api/assignments/:id
 * Update fields: status, estimated_hours, course_color, title, description, due_at
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
  const validation = validateBody(assignmentUpdateSchema, rawBody);
  if (!validation.success) return validation.response;
  const updates: Record<string, unknown> = { ...validation.data };

  updates.updated_at = new Date();

  const result = await sql`
    WITH updated AS (
      UPDATE app.assignments
      SET ${sql(updates, ...Object.keys(updates))}
      WHERE id = ${id}::uuid AND user_id = ${user.user_id}::uuid
      RETURNING *
    )
    SELECT id, user_id,
           canvas_course_id::text AS canvas_course_id,
           canvas_assignment_id::text AS canvas_assignment_id,
           title, description, course_name, course_color,
           due_at, estimated_hours, logged_hours, source, assignment_type,
           CASE
             WHEN status <> 'done' AND due_at IS NOT NULL AND due_at < NOW() THEN 'late'
             WHEN status = 'late' AND (due_at IS NULL OR due_at >= NOW()) THEN 'upcoming'
             ELSE status
           END AS status,
           submitted_at, score, points_possible,
           created_at, updated_at
    FROM updated
  `;
  if (result.length === 0) return tracedError('Not found', 404);

  return NextResponse.json(result[0]);
});

/**
 * DELETE /api/assignments/:id
 * Only manual assignments can be deleted. Canvas assignments are hidden instead.
 */
export const DELETE = withErrorHandler(async (_request, context: any) => {
  const user = await requireAuth();

  const { id } = await context.params;
  requireValidId(id);

  const result = await sql`
    DELETE FROM app.assignments
    WHERE id = ${id}::uuid AND user_id = ${user.user_id}::uuid AND source = 'manual'
    RETURNING id
  `;

  if (result.length === 0) {
    // might be a canvas assignment -- check if it exists
    const [exists] = await sql`
      SELECT source FROM app.assignments
      WHERE id = ${id}::uuid AND user_id = ${user.user_id}::uuid
    `;
    if (exists?.source === 'canvas') {
      return tracedError('Canvas assignments cannot be deleted', 400);
    }
    return tracedError('Not found', 404);
  }

  return NextResponse.json({ deleted: true });
});
