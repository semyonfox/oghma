import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import sql from "@/database/pgsql.js";

export const PATCH = withErrorHandler(
  async (
    request: Request,
    { params }: { params: Promise<{ courseId: string }> },
  ) => {
    const user = await validateSession();
    if (!user) return tracedError("Unauthorized", 401);

    const userId = user.user_id;
    const { courseId: courseIdStr } = await params;
    const courseId = parseInt(courseIdStr, 10);
    if (isNaN(courseId)) return tracedError("Invalid course ID", 400);

    const body = await request.json();
    const { isActive } = body;

    const setting = await sql`
      UPDATE app.user_course_settings
      SET 
        is_active = ${isActive},
        archived_at = CASE 
          WHEN ${isActive} = false THEN NOW() 
          ELSE NULL 
        END,
        updated_at = NOW()
      WHERE user_id = ${userId}::uuid AND canvas_course_id = ${courseId}
      RETURNING 
        id,
        canvas_course_id as "canvasCourseId",
        course_name as "courseName",
        is_active as "isActive",
        auto_archived as "autoArchived",
        archived_at as "archivedAt"
    `;

    if (setting.length === 0) {
      return tracedError("Course setting not found", 404);
    }

    return NextResponse.json(setting[0]);
  },
);

export const DELETE = withErrorHandler(
  async (
    _request: Request,
    { params }: { params: Promise<{ courseId: string }> },
  ) => {
    const user = await validateSession();
    if (!user) return tracedError("Unauthorized", 401);

    const userId = user.user_id;
    const { courseId: courseIdStr } = await params;
    const courseId = parseInt(courseIdStr, 10);
    if (isNaN(courseId)) return tracedError("Invalid course ID", 400);

    await sql`
      DELETE FROM app.user_course_settings
      WHERE user_id = ${userId}::uuid AND canvas_course_id = ${courseId}
    `;

    return NextResponse.json({ success: true });
  },
);
