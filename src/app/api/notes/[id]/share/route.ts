import { NextResponse } from "next/server";
import {
  withErrorHandler,
  requireAuth,
  requireValidId,
  ApiError,
  type RouteParamsContext,
} from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rateLimiter";
import { isValidUUID } from "@/lib/utils/uuid";
import { generateUUID } from "@/lib/utils/uuid";
import { createNoteWithTree } from "@/lib/notes/storage/create-note";
import { getStorageProvider } from "@/lib/storage/init";
import sql from "@/database/pgsql";
import logger from "@/lib/logger";
import { isSharedImportedFileKey } from "@/lib/canvas/import-cache";

/**
 * POST /api/notes/:id/share
 *
 * Clone a note to another user's workspace.
 * Creates an independent copy with cloned_from FK pointing to original.
 *
 * @param id - Source note UUID
 * @param targetUserId - Target user UUID
 * @param targetParentId - Where to place clone (null = root)
 * @returns Cloned note ID
 */
export const POST = withErrorHandler(async (
  request: Request,
  context: RouteParamsContext<{ id: string }>,
) => {
  const user = await requireAuth();

  const limited = await checkRateLimit("share", user.user_id);
  if (limited) return limited;

  const { id } = await context.params;
  const sourceNoteId = requireValidId(id, "note ID");

  const body = await request.json();
  const { targetUserId, targetParentId } = body;

  if (!targetUserId || !isValidUUID(targetUserId)) {
    throw new ApiError(400, "Invalid or missing targetUserId");
  }

  if (targetParentId && !isValidUUID(targetParentId)) {
    throw new ApiError(400, "Invalid targetParentId");
  }

  // cannot share to yourself
  if (targetUserId === user.user_id) {
    throw new ApiError(
      400,
      "Cannot share a note with yourself. Use duplicate instead.",
    );
  }

  // verify target user exists and is active
  const targetUser = await sql`
    SELECT user_id FROM app.login
    WHERE user_id = ${targetUserId}::uuid
      AND is_active = true AND deleted_at IS NULL
  `;
  if (!targetUser.length) {
    throw new ApiError(404, "Target user not found");
  }

  // only the owner can share their own note
  const sourceNote = await sql`
    SELECT note_id, title, content, s3_key, is_folder, imported_file_cache_id
    FROM app.notes
    WHERE note_id = ${sourceNoteId}::uuid
      AND user_id = ${user.user_id}::uuid
      AND deleted_at IS NULL
  `;

  if (!sourceNote.length) {
    throw new ApiError(404, "Source note not found");
  }

  const note = sourceNote[0];
  const cloneId = generateUUID();
  const clonedContent = note.imported_file_cache_id
    ? String(note.content ?? "").replace(
        /\/api\/notes\/[0-9a-f-]{36}\/assets\?name=/gi,
        `/api/notes/${cloneId}/assets?name=`,
      )
    : note.content;

  // Validate the destination before creating any side effects. In particular,
  // do not copy storage or insert a clone that cannot be placed in its tree.
  if (targetParentId) {
    const parentCheck = await sql`
      SELECT note_id FROM app.notes
      WHERE note_id = ${targetParentId}::uuid
        AND user_id = ${targetUserId}::uuid
        AND is_folder = true
        AND deleted_at IS NULL
    `;
    if (!parentCheck.length) {
      throw new ApiError(
        400,
        "targetParentId is not a valid folder for the target user",
      );
    }
  }

  // Copy before the DB record so a failed copy cannot produce a broken clone.
  // Later failures explicitly remove this object.
  let clonedS3Key: string | null = null;
  const storage = getStorageProvider();
  if (isSharedImportedFileKey(note.s3_key)) {
    // Immutable cache objects are shared by reference. The recipient still
    // receives a private note row; annotations and Canvas metadata are not copied.
    clonedS3Key = note.s3_key;
  } else if (note.s3_key) {
    try {
      const filename = note.s3_key.split("/").pop() ?? "file";
      clonedS3Key = `notes/${cloneId}/${filename}`;
      await storage.copyObject(note.s3_key, clonedS3Key, {});
    } catch (err) {
      logger.warn("failed to copy S3 object for share", { sourceKey: note.s3_key, error: err });
      throw new ApiError(502, "Failed to copy shared file");
    }
  }

  try {
    await createNoteWithTree({
      noteId: cloneId,
      userId: targetUserId,
      title: note.title + " (shared)",
      content: clonedContent,
      s3Key: clonedS3Key,
      isFolder: note.is_folder,
      parentId: targetParentId || null,
      clonedFrom: sourceNoteId,
      importedFileCacheId: note.imported_file_cache_id ?? null,
    });
  } catch (err) {
    if (clonedS3Key && !isSharedImportedFileKey(clonedS3Key)) {
      await storage.deleteObject(clonedS3Key).catch((cleanupError) =>
        logger.error("failed to clean up shared storage object", { key: clonedS3Key, error: cleanupError }),
      );
    }
    throw err;
  }

  return NextResponse.json(
    {
      success: true,
      clonedNoteId: cloneId,
      message: "Note cloned to target user",
    },
    { status: 201 },
  );
});
