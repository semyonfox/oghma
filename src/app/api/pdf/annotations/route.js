// PDF annotations endpoint
// Store, retrieve, and delete annotations for PDFs
import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth.js';
import { saveAnnotations, getAnnotations, deleteAnnotations, deleteNoteAnnotations } from '@/lib/notes/storage/pdf-annotations.js';
import sql from '@/database/pgsql.js';

/**
 * GET /api/pdf/annotations?noteId=123&attachmentId=456
 * Retrieve annotations for a specific note/attachment
 */
export async function GET(request) {
  try {
    // Get authenticated user
    const user = await validateSession();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const noteIdParam = url.searchParams.get('noteId');
    const attachmentIdParam = url.searchParams.get('attachmentId');

    if (!noteIdParam) {
      return NextResponse.json(
        { error: 'noteId query parameter is required' },
        { status: 400 }
      );
    }

    const noteId = parseInt(noteIdParam, 10);
    const attachmentId = attachmentIdParam ? parseInt(attachmentIdParam, 10) : null;

    if (isNaN(noteId)) {
      return NextResponse.json(
        { error: 'Invalid noteId' },
        { status: 400 }
      );
    }

    // Verify user owns this note
    const noteResult = await sql`
      SELECT note_id FROM app.notes
      WHERE note_id = ${noteId} AND user_id = ${user.user_id}
    `;

    if (noteResult.length === 0) {
      return NextResponse.json(
        { error: 'Note not found' },
        { status: 404 }
      );
    }

    // Get annotations
    const annotations = await getAnnotations(user.user_id, noteId, attachmentId);

    return NextResponse.json({
      success: true,
      noteId,
      attachmentId,
      annotations,
    });
  } catch (error) {
    console.error('Get annotations error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve annotations' },
      { status: 500 }
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
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { noteId, attachmentId, annotationData } = body;

    if (!noteId || !annotationData) {
      return NextResponse.json(
        { error: 'noteId and annotationData are required' },
        { status: 400 }
      );
    }

    const noteIdNum = parseInt(noteId, 10);
    const attachmentIdNum = attachmentId ? parseInt(attachmentId, 10) : null;

    if (isNaN(noteIdNum)) {
      return NextResponse.json(
        { error: 'Invalid noteId' },
        { status: 400 }
      );
    }

    // Verify user owns this note
    const noteResult = await sql`
      SELECT note_id FROM app.notes
      WHERE note_id = ${noteIdNum} AND user_id = ${user.user_id}
    `;

    if (noteResult.length === 0) {
      return NextResponse.json(
        { error: 'Note not found' },
        { status: 404 }
      );
    }

    // Save annotations
    const result = await saveAnnotations(user.user_id, noteIdNum, attachmentIdNum, annotationData);

    return NextResponse.json({
      success: true,
      annotation: result,
    });
  } catch (error) {
    console.error('Save annotations error:', error);
    return NextResponse.json(
      { error: 'Failed to save annotations' },
      { status: 500 }
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
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const idParam = url.searchParams.get('id');

    if (!idParam) {
      return NextResponse.json(
        { error: 'id query parameter is required' },
        { status: 400 }
      );
    }

    const annotationId = parseInt(idParam, 10);

    if (isNaN(annotationId)) {
      return NextResponse.json(
        { error: 'Invalid annotation ID' },
        { status: 400 }
      );
    }

    // Delete annotation (handles ownership verification via user_id)
    await deleteAnnotations(user.user_id, annotationId);

    return NextResponse.json({
      success: true,
      message: 'Annotation deleted',
    });
  } catch (error) {
    console.error('Delete annotations error:', error);
    return NextResponse.json(
      { error: 'Failed to delete annotation' },
      { status: 500 }
    );
  }
}
