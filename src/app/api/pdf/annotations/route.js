// PDF annotations endpoint
// Store, retrieve, and delete annotations for PDFs
import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth.js";
import {
  saveAnnotations,
  getAnnotations,
  deleteAnnotations,
} from "@/lib/notes/storage/pdf-annotations.js";
import { isValidUUID } from "@/lib/uuid-validation.js";
import sql from "@/database/pgsql.js";
import logger from "@/lib/logger";

/**
 * GET /api/pdf/annotations?noteId=123&attachmentId=456
 * Retrieve annotations for a specific note/attachment
 */
export async function GET(request) {
  try {
    // Get authenticated user
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const noteId = url.searchParams.get("noteId");
    const attachmentId = url.searchParams.get("attachmentId");

    // Validate noteId is a valid UUID
    if (!noteId || !isValidUUID(noteId)) {
      return NextResponse.json(
        { error: "Valid noteId (UUID) is required" },
        { status: 400 },
      );
    }

    // Validate attachmentId if provided
    if (attachmentId && !isValidUUID(attachmentId)) {
      return NextResponse.json(
        { error: "Invalid attachmentId - must be a valid UUID" },
        { status: 400 },
      );
    }

    // Verify user owns this note
    const noteResult = await sql`
      SELECT note_id FROM app.notes
      WHERE note_id = ${noteId}::uuid AND user_id = ${user.user_id}::uuid
    `;

    if (noteResult.length === 0) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
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
  } catch (error) {
    logger.error("get annotations error", { error });
    return NextResponse.json(
      { error: "Failed to retrieve annotations" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/pdf/annotations
 * Save or update annotations for a note
 * Body: { noteId, attachmentId?, annotationData }
 */
export async function POST(request) {
  try {
    // Get authenticated user
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { noteId, attachmentId, annotationData } = body;

    // Validate required fields
    if (!noteId || !annotationData) {
      return NextResponse.json(
        { error: "noteId and annotationData are required" },
        { status: 400 },
      );
    }

    // Validate noteId is a UUID
    if (!isValidUUID(noteId)) {
      return NextResponse.json(
        { error: "Invalid noteId - must be a valid UUID" },
        { status: 400 },
      );
    }

    // Validate attachmentId if provided
    if (attachmentId && !isValidUUID(attachmentId)) {
      return NextResponse.json(
        { error: "Invalid attachmentId - must be a valid UUID" },
        { status: 400 },
      );
    }

    // Verify user owns this note
    const noteResult = await sql`
      SELECT note_id FROM app.notes
      WHERE note_id = ${noteId}::uuid AND user_id = ${user.user_id}::uuid
    `;

    if (noteResult.length === 0) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
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
  } catch (error) {
    logger.error("save annotations error", { error });
    return NextResponse.json(
      { error: "Failed to save annotations" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/pdf/annotations?id=123
 * Delete specific annotation by ID
 */
export async function DELETE(request) {
  try {
    // Get authenticated user
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const annotationId = url.searchParams.get("id");

    // Validate annotationId is a UUID
    if (!annotationId || !isValidUUID(annotationId)) {
      return NextResponse.json(
        { error: "Valid annotation ID (UUID) is required" },
        { status: 400 },
      );
    }

    // Delete annotation (handles ownership verification via user_id)
    await deleteAnnotations(user.user_id, annotationId);

    return NextResponse.json({
      success: true,
      message: "Annotation deleted",
    });
  } catch (error) {
    logger.error("delete annotations error", { error });
    return NextResponse.json(
      { error: "Failed to delete annotation" },
      { status: 500 },
    );
  }
}
