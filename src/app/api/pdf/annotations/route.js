// PDF annotations endpoint
// Store, retrieve, and delete annotations for PDFs
import { NextResponse } from "next/server";
import { withErrorHandler, requireAuth, ApiError } from "@/lib/api-error";
import {
  saveAnnotations,
  getAnnotations,
  deleteAnnotations,
} from "@/lib/notes/storage/pdf-annotations.js";
import { isValidUUID } from "@/lib/utils/uuid";
import sql from "@/database/pgsql.js";

/**
 * GET /api/pdf/annotations?noteId=123&attachmentId=456
 * Retrieve annotations for a specific note/attachment
 */
export const GET = withErrorHandler(async (request) => {
  const user = await requireAuth();

  const url = new URL(request.url);
  const noteId = url.searchParams.get("noteId");
  const attachmentId = url.searchParams.get("attachmentId");

  // Validate noteId is a valid UUID
  if (!noteId || !isValidUUID(noteId)) {
    throw new ApiError(400, "Valid noteId (UUID) is required");
  }

  // Validate attachmentId if provided
  if (attachmentId && !isValidUUID(attachmentId)) {
    throw new ApiError(400, "Invalid attachmentId - must be a valid UUID");
  }

  // Verify user owns this note
  const noteResult = await sql`
    SELECT note_id FROM app.notes
    WHERE note_id = ${noteId}::uuid
      AND user_id = ${user.user_id}::uuid
      AND deleted_at IS NULL
  `;

  if (noteResult.length === 0) {
    throw new ApiError(404, "Note not found");
  }

  // Get annotations
  const annotations = await getAnnotations(
    user.user_id,
    noteId,
    attachmentId,
  );

  return NextResponse.json({
    success: true,
    noteId,
    attachmentId,
    annotations,
  });
});

/**
 * POST /api/pdf/annotations
 * Save or update annotations for a note
 * Body: { noteId, attachmentId?, annotationData }
 */
export const POST = withErrorHandler(async (request) => {
  const user = await requireAuth();

  const body = await request.json();
  const { noteId, attachmentId, annotationData } = body;

  // Validate required fields
  if (!noteId || !annotationData) {
    throw new ApiError(400, "noteId and annotationData are required");
  }

  // Validate noteId is a UUID
  if (!isValidUUID(noteId)) {
    throw new ApiError(400, "Invalid noteId - must be a valid UUID");
  }

  // Validate attachmentId if provided
  if (attachmentId && !isValidUUID(attachmentId)) {
    throw new ApiError(400, "Invalid attachmentId - must be a valid UUID");
  }

  // Verify user owns this note
  const noteResult = await sql`
    SELECT note_id FROM app.notes
    WHERE note_id = ${noteId}::uuid
      AND user_id = ${user.user_id}::uuid
      AND deleted_at IS NULL
  `;

  if (noteResult.length === 0) {
    throw new ApiError(404, "Note not found");
  }

  // Save annotations
  const result = await saveAnnotations(
    user.user_id,
    noteId,
    attachmentId,
    annotationData,
  );

  return NextResponse.json({
    success: true,
    annotation: result,
  });
});

/**
 * DELETE /api/pdf/annotations?id=123
 * Delete specific annotation by ID
 */
export const DELETE = withErrorHandler(async (request) => {
  const user = await requireAuth();

  const url = new URL(request.url);
  const annotationId = url.searchParams.get("id");

  // Validate annotationId is a UUID
  if (!annotationId || !isValidUUID(annotationId)) {
    throw new ApiError(400, "Valid annotation ID (UUID) is required");
  }

  // Delete annotation (handles ownership verification via user_id)
  await deleteAnnotations(user.user_id, annotationId);

  return NextResponse.json({
    success: true,
    message: "Annotation deleted",
  });
});
