import { NextRequest, NextResponse } from "next/server";
import {
  withErrorHandler,
  tracedError,
  requireAuth,
  requireValidId,
} from "@/lib/api-error";
import sql from "@/database/pgsql.js";

/**
 * PATCH /api/time-blocks/:id
 * Move or resize a time block.
 */
export const PATCH = withErrorHandler(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const user = await requireAuth();
    const { id } = await params;
    requireValidId(id);

    const body = await request.json();
    const { starts_at, ends_at, assignment_id, title } = body;

    let pomodoroCount: number | undefined;
    if (starts_at && ends_at) {
      const durationMins =
        (new Date(ends_at).getTime() - new Date(starts_at).getTime()) / 60000;
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

    if (result.length === 0) return tracedError("Not found", 404);
    return NextResponse.json(result[0]);
  },
);

/**
 * DELETE /api/time-blocks/:id
 */
export const DELETE = withErrorHandler(
  async (
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const user = await requireAuth();
    const { id } = await params;
    requireValidId(id);

    const result = await sql`
    DELETE FROM app.time_blocks
    WHERE id = ${id}::uuid AND user_id = ${user.user_id}::uuid
    RETURNING id
  `;

    if (result.length === 0) return tracedError("Not found", 404);
    return NextResponse.json({ deleted: true });
  },
);
