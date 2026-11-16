import { NextResponse } from "next/server";
import {
  parseJsonObject,
  requireAuth,
  type RouteParamsContext,
  withErrorHandler,
  tracedError,
} from "@/lib/api-error";
import sql from "@/database/pgsql";
import { canvasIdForBigintColumn } from "@/lib/canvas/id";

export const PATCH = withErrorHandler(
  async (
    request: Request,
    { params }: RouteParamsContext<{ courseId: string }>,
  ) => {
    const user = await requireAuth();

    const userId = user.user_id;
    const { courseId: courseIdStr } = await params;
    let courseId: string;
    try {
      courseId = canvasIdForBigintColumn(courseIdStr, "Canvas course ID");
    } catch {
      return tracedError("Invalid course ID", 400);
    }

    const body = await parseJsonObject(request);
    const { isActive } = body;
    if (typeof isActive !== "boolean") {
      return tracedError("isActive must be a boolean", 400);
    }

    // an upsert, because a course canvas archived has no row until the user restores it
    const setting = await sql`
      INSERT INTO app.user_course_settings (user_id, canvas_course_id, course_name, is_active, archived_at)
      VALUES (
        ${userId}::uuid, ${courseId}::bigint,
        COALESCE(
          (SELECT NULLIF(BTRIM(f.title), '') FROM app.notes f
           WHERE f.user_id = ${userId}::uuid AND f.canvas_course_id = ${courseId}::bigint
             AND f.is_folder AND f.canvas_module_id IS NULL AND f.canvas_assignment_id IS NULL
             AND f.deleted_at IS NULL
           ORDER BY f.created_at ASC LIMIT 1),
          'Course ' || ${courseId}::text
        ),
        ${isActive},
        CASE WHEN ${isActive} = false THEN NOW() END
      )
      ON CONFLICT (user_id, canvas_course_id) DO UPDATE SET
        is_active = EXCLUDED.is_active,
        archived_at = EXCLUDED.archived_at,
        updated_at = NOW()
      RETURNING
        id,
        canvas_course_id::text as "canvasCourseId",
        course_name as "courseName",
        is_active as "isActive",
        auto_archived as "autoArchived",
        archived_at as "archivedAt"
    `;

    return NextResponse.json(setting[0]);
  },
);

export const DELETE = withErrorHandler(
  async (
    _request: Request,
    { params }: RouteParamsContext<{ courseId: string }>,
  ) => {
    const user = await requireAuth();

    const userId = user.user_id;
    const { courseId: courseIdStr } = await params;
    let courseId: string;
    try {
      courseId = canvasIdForBigintColumn(courseIdStr, "Canvas course ID");
    } catch {
      return tracedError("Invalid course ID", 400);
    }

    await sql`
      DELETE FROM app.user_course_settings
      WHERE user_id = ${userId}::uuid AND canvas_course_id = ${courseId}::bigint
    `;

    return NextResponse.json({ success: true });
  },
);
