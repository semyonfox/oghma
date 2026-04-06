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
    SELECT * FROM app.assignments
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
  const updates: string[] = [];
  const values: any[] = [];

  for (const key of allowed) {
    if (key in body) {
      updates.push(key);
      values.push(body[key]);
    }
  }

  if (updates.length === 0) {
    throw new ApiError(400, 'No valid fields to update');
  }

  // build dynamic SET clause
  const setClauses = updates.map((col, i) => `${col} = $${i + 3}`).join(', ');
  const query = `
    UPDATE app.assignments
    SET ${setClauses}, updated_at = NOW()
    WHERE id = $1::uuid AND user_id = $2::uuid
    RETURNING *
  `;

  const result = await sql.unsafe(query, [id, user.user_id, ...values]);
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
