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

/** PATCH /api/tree/course: the user's own finished or active call on a top-level folder */
export const PATCH = withErrorHandler(async (request) => {
  const user = await requireAuth();
  const parsed = overrideSchema.safeParse(await parseJsonObject(request, 1024));
  if (!parsed.success) throw new ApiError(400, "Invalid course status");
  const { folderId, finished } = parsed.data;

  const rows = await sql<{ note_id: string }[]>`
    UPDATE app.notes n
    SET course_finished_override = ${finished}
    FROM app.tree_items tree
    WHERE n.note_id = ${folderId}::uuid
      AND n.user_id = ${user.user_id}::uuid
      AND n.is_folder
      AND n.deleted_at IS NULL
      AND tree.note_id = n.note_id
      AND tree.user_id = n.user_id
      AND tree.parent_id IS NULL
    RETURNING n.note_id
  `;
  if (!rows[0]) throw new ApiError(404, "Top-level folder not found");
  return NextResponse.json({ folderId, finished });
});
