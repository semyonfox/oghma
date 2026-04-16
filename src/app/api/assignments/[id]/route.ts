import { NextResponse } from 'next/server';
import { withErrorHandler, requireAuth, requireValidId, ApiError, tracedError } from '@/lib/api-error';
import sql from '@/database/pgsql.js';

/**
 * GET /api/assignments/:id
 */
export const GET = withErrorHandler(async (_request, context: any) => {
  const user = await requireAuth();

  const { id } = await context.params;
  requireValidId(id);

  const [row] = await sql`
    SELECT id, user_id, canvas_course_id, canvas_assignment_id,
           title, description, course_name, course_color,
           due_at, estimated_hours, source, status,
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

  const body = await request.json();
  const allowed = ['title', 'description', 'status', 'estimated_hours', 'course_color', 'due_at', 'course_name'];
  const updates: Record<string, any> = {};

  for (const key of allowed) {
    if (key in body) {
      updates[key] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new ApiError(400, 'No valid fields to update');
  }

  updates.updated_at = new Date();

  const result = await sql`
    UPDATE app.assignments
    SET ${sql(updates, ...Object.keys(updates))}
    WHERE id = ${id}::uuid AND user_id = ${user.user_id}::uuid
    RETURNING id, user_id, canvas_course_id, canvas_assignment_id,
              title, description, course_name, course_color,
              due_at, estimated_hours, source, status,
              submitted_at, score, points_possible,
              created_at, updated_at
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
