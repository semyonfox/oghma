import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import sql from "@/database/pgsql.js";

export const GET = withErrorHandler(async () => {
  const user = await validateSession();
  if (!user) return tracedError("Unauthorized", 401);

  const userId = user.user_id;

  const settings = await sql`
    SELECT 
      id,
      canvas_course_id as "canvasCourseId",
      course_name as "courseName",
      is_active as "isActive",
      auto_archived as "autoArchived",
      archived_at as "archivedAt"
    FROM app.user_course_settings
    WHERE user_id = ${userId}::uuid
    ORDER BY course_name
  `;

  return NextResponse.json({ settings });
});

export const POST = withErrorHandler(async (request: Request) => {
  const user = await validateSession();
  if (!user) return tracedError("Unauthorized", 401);

  const userId = user.user_id;
  const body = await request.json();
  const { canvasCourseId, courseName, isActive } = body;

  if (!canvasCourseId || !courseName) {
    return tracedError("Missing required fields", 400);
  }

  const setting = await sql`
    INSERT INTO app.user_course_settings (
      user_id, canvas_course_id, course_name, is_active, 
      auto_archived, archived_at
    ) VALUES (
      ${userId}::uuid, ${canvasCourseId}, ${courseName}, ${isActive ?? true},
      false, ${isActive === false ? sql`NOW()` : null}
    )
    ON CONFLICT (user_id, canvas_course_id) 
    DO UPDATE SET 
      is_active = EXCLUDED.is_active,
      archived_at = CASE 
        WHEN EXCLUDED.is_active = false THEN NOW() 
        ELSE NULL 
      END,
      updated_at = NOW()
    RETURNING 
      id,
      canvas_course_id as "canvasCourseId",
      course_name as "courseName",
      is_active as "isActive",
      auto_archived as "autoArchived",
      archived_at as "archivedAt"
  `;

  return NextResponse.json(setting[0]);
});
