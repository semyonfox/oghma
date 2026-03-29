import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth.js";
import sql from "@/database/pgsql.js";
import logger from "@/lib/logger";

/**
 * GET /api/assignments
 * List assignments with optional status/course filters.
 */
export async function GET(request: Request) {
  try {
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const course = url.searchParams.get("course");

    let rows;
    if (status && course) {
      rows = await sql`
        SELECT * FROM app.assignments
        WHERE user_id = ${user.user_id}::uuid
          AND status = ${status}
          AND course_name = ${course}
        ORDER BY due_at ASC NULLS LAST, created_at DESC
      `;
    } else if (status) {
      rows = await sql`
        SELECT * FROM app.assignments
        WHERE user_id = ${user.user_id}::uuid AND status = ${status}
        ORDER BY due_at ASC NULLS LAST, created_at DESC
      `;
    } else if (course) {
      rows = await sql`
        SELECT * FROM app.assignments
        WHERE user_id = ${user.user_id}::uuid AND course_name = ${course}
        ORDER BY due_at ASC NULLS LAST, created_at DESC
      `;
    } else {
      rows = await sql`
        SELECT * FROM app.assignments
        WHERE user_id = ${user.user_id}::uuid
        ORDER BY due_at ASC NULLS LAST, created_at DESC
      `;
    }

    return NextResponse.json(rows);
  } catch (err: any) {
    logger.error("assignments list error", { error: err?.message ?? err });
    return NextResponse.json(
      { error: "Failed to fetch assignments" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/assignments
 * Create a manual assignment/task.
 */
export async function POST(request: Request) {
  try {
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      title,
      course_name,
      course_color,
      due_at,
      estimated_hours,
      description,
    } = body;

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const [row] = await sql`
      INSERT INTO app.assignments (
        user_id, title, description, course_name, course_color,
        due_at, estimated_hours, source
      ) VALUES (
        ${user.user_id}::uuid, ${title.trim()}, ${description ?? null},
        ${course_name ?? null}, ${course_color ?? null},
        ${due_at ?? null}, ${estimated_hours ?? null}, 'manual'
      )
      RETURNING *
    `;

    return NextResponse.json(row, { status: 201 });
  } catch (err: any) {
    logger.error("assignment create error", { error: err?.message ?? err });
    return NextResponse.json(
      { error: "Failed to create assignment" },
      { status: 500 },
    );
  }
}
