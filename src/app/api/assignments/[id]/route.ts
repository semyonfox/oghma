import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth.js';
import { isValidUUID } from '@/lib/utils/uuid';
import sql from '@/database/pgsql.js';
import logger from '@/lib/logger';

/**
 * GET /api/assignments/:id
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await validateSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    if (!isValidUUID(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

    const [row] = await sql`
      SELECT * FROM app.assignments
      WHERE id = ${id}::uuid AND user_id = ${user.user_id}::uuid
    `;

    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(row);
  } catch (err: any) {
    logger.error('assignment get error', { error: err?.message ?? err });
    return NextResponse.json({ error: 'Failed to fetch assignment' }, { status: 500 });
  }
}

/**
 * PATCH /api/assignments/:id
 * Update fields: status, estimated_hours, course_color, title, description, due_at
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await validateSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    if (!isValidUUID(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

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
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
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
    if (result.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json(result[0]);
  } catch (err: any) {
    logger.error('assignment update error', { error: err?.message ?? err });
    return NextResponse.json({ error: 'Failed to update assignment' }, { status: 500 });
  }
}

/**
 * DELETE /api/assignments/:id
 * Only manual assignments can be deleted. Canvas assignments are hidden instead.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await validateSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    if (!isValidUUID(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

    const result = await sql`
      DELETE FROM app.assignments
      WHERE id = ${id}::uuid AND user_id = ${user.user_id}::uuid AND source = 'manual'
      RETURNING id
    `;

    if (result.length === 0) {
      // might be a canvas assignment — check if it exists
      const [exists] = await sql`
        SELECT source FROM app.assignments
        WHERE id = ${id}::uuid AND user_id = ${user.user_id}::uuid
      `;
      if (exists?.source === 'canvas') {
        return NextResponse.json({ error: 'Canvas assignments cannot be deleted' }, { status: 400 });
      }
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ deleted: true });
  } catch (err: any) {
    logger.error('assignment delete error', { error: err?.message ?? err });
    return NextResponse.json({ error: 'Failed to delete assignment' }, { status: 500 });
  }
}
