import { NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/database/pgsql";
import {
  ApiError,
  parseJsonObject,
  requireAuth,
  withErrorHandler,
} from "@/lib/api-error";

const overrideSchema = z.object({
  folderId: z.uuid(),
  // true marks the folder finished, false keeps a finished canvas course active, null follows canvas
  finished: z.boolean().nullable(),
});

/**
 * PATCH /api/tree/course: the user's own finished or active call on a top-level folder.
 * A canvas course stores it as the course archive setting, so every feature agrees.
 * Other folders keep it on the folder itself.
 */
export const PATCH = withErrorHandler(async (request) => {
  const user = await requireAuth();
  const parsed = overrideSchema.safeParse(await parseJsonObject(request, 1024));
  if (!parsed.success) throw new ApiError(400, "Invalid course status");
  const { folderId, finished } = parsed.data;

  await sql.begin(async (tx) => {
    const [folder] = await tx<{ title: string; canvas_course_id: string | null }[]>`
      SELECT n.title,
        CASE WHEN n.canvas_module_id IS NULL AND n.canvas_assignment_id IS NULL
          THEN n.canvas_course_id::text END AS canvas_course_id
      FROM app.notes n
      JOIN app.tree_items tree ON tree.note_id = n.note_id AND tree.user_id = n.user_id
      WHERE n.note_id = ${folderId}::uuid
        AND n.user_id = ${user.user_id}::uuid
        AND n.is_folder
        AND n.deleted_at IS NULL
        AND tree.parent_id IS NULL
      FOR UPDATE OF n
    `;
    if (!folder) throw new ApiError(404, "Top-level folder not found");

    if (!folder.canvas_course_id) {
      await tx`
        UPDATE app.notes SET course_finished_override = ${finished}
        WHERE note_id = ${folderId}::uuid AND user_id = ${user.user_id}::uuid
      `;
      return;
    }

    if (finished === null) {
      await tx`
        DELETE FROM app.user_course_settings
        WHERE user_id = ${user.user_id}::uuid AND canvas_course_id = ${folder.canvas_course_id}::bigint
      `;
      return;
    }
    await tx`
      INSERT INTO app.user_course_settings (user_id, canvas_course_id, course_name, is_active, archived_at)
      VALUES (${user.user_id}::uuid, ${folder.canvas_course_id}::bigint, ${folder.title},
        ${!finished}, CASE WHEN ${finished}::boolean THEN NOW() END)
      ON CONFLICT (user_id, canvas_course_id) DO UPDATE SET
        is_active = EXCLUDED.is_active,
        archived_at = EXCLUDED.archived_at,
        updated_at = NOW()
    `;
  });
  return NextResponse.json({ folderId, finished });
});
