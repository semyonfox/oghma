// PDF annotations endpoint
// Store, retrieve, and delete annotations for PDFs
import { NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandler, requireAuth, ApiError, parseJsonObject } from "@/lib/api-error";
import {
  AnnotationTargetNotFoundError,
  saveAnnotations,
  getAnnotations,
  deleteAnnotations,
} from "@/lib/notes/storage/pdf-annotations";
import { isValidUUID } from "@/lib/utils/uuid";
import sql from "@/database/pgsql";
import { validateBody } from "@/lib/validations/schemas";

// annotation documents are opaque to the server, but must be structured JSON
const saveAnnotationsSchema = z.object({
  noteId: z.string().uuid(),
  attachmentId: z.string().uuid().nullish(),
  annotationData: z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]),
});

/**
 * GET /api/pdf/annotations?noteId=123&attachmentId=456
 * Retrieve annotations for a note, optionally narrowed to one attachment
 */
export const GET = withErrorHandler(async (request) => {
  const user = await requireAuth();

  const url = new URL(request.url);
  const noteId = url.searchParams.get("noteId");
  const attachmentId = url.searchParams.get("attachmentId") ?? undefined;

  if (!noteId || !isValidUUID(noteId)) {
    throw new ApiError(400, "Valid noteId (UUID) is required");
  }
  if (attachmentId !== undefined && !isValidUUID(attachmentId)) {
    throw new ApiError(400, "Invalid attachmentId - must be a valid UUID");
  }

  const noteResult = await sql<{ note_id: string }[]>`
    SELECT note_id FROM app.notes
    WHERE note_id = ${noteId}::uuid
      AND user_id = ${user.user_id}::uuid
      AND deleted_at IS NULL
  `;
  if (noteResult.length === 0) {
    throw new ApiError(404, "Note not found");
  }

  const annotations = await getAnnotations(user.user_id, noteId, attachmentId);

  return NextResponse.json({
    success: true,
    noteId,
    attachmentId: attachmentId ?? null,
    annotations,
  });
});

/**
 * POST /api/pdf/annotations
 * Save or replace the annotations for a note/attachment pair
 * Body: { noteId, attachmentId?, annotationData }
 */
export const POST = withErrorHandler(async (request) => {
  const user = await requireAuth();

  const validation = validateBody(saveAnnotationsSchema, await parseJsonObject(request));
  if (!validation.success) return validation.response;
  const { noteId, attachmentId, annotationData } = validation.data;

  try {
    const annotation = await saveAnnotations(
      user.user_id,
      noteId,
      attachmentId ?? null,
      annotationData,
    );
    return NextResponse.json({ success: true, annotation });
  } catch (error) {
    if (error instanceof AnnotationTargetNotFoundError) {
      throw new ApiError(404, error.message);
    }
    throw error;
  }
});

/**
 * DELETE /api/pdf/annotations?id=123
 * Delete specific annotation by ID
 */
export const DELETE = withErrorHandler(async (request) => {
  const user = await requireAuth();

  const url = new URL(request.url);
  const annotationId = url.searchParams.get("id");

  if (!annotationId || !isValidUUID(annotationId)) {
    throw new ApiError(400, "Valid annotation ID (UUID) is required");
  }

  // scoped to user_id, so another user's id reads as not found
  const deleted = await deleteAnnotations(user.user_id, annotationId);
  if (!deleted) {
    throw new ApiError(404, "Annotation not found");
  }

  return NextResponse.json({
    success: true,
    message: "Annotation deleted",
  });
});
