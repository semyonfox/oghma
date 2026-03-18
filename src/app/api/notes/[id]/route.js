import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth.js';
import { isValidUUID } from '@/lib/uuid-validation.js';
import { removeNoteFromTree } from '@/lib/notes/storage/pg-tree.js';
import { deleteNoteAnnotations } from '@/lib/notes/storage/pdf-annotations.js';
import sql from '@/database/pgsql.js';

/**
 * Helper: Filter note to only include requested fields
 */
function filterNoteFields(note, fields) {
  if (!fields || fields.length === 0) {
    return note;
  }
  
  const filtered = {};
  for (const field of fields) {
    if (field in note) {
      filtered[field] = note[field];
    }
  }
  return filtered;
}

export async function GET(request, { params }) {
  try {
    // Get authenticated user
    const user = await validateSession();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const noteId = id;
    
    if (!isValidUUID(noteId)) {
      return NextResponse.json(
        { error: 'Invalid note ID' },
        { status: 400 }
      );
    }

     // Get note from PostgreSQL (verify ownership)
     const result = await sql`
       SELECT note_id, title, content, is_folder, s3_key, deleted, shared, pinned, created_at, updated_at FROM app.notes
       WHERE note_id = ${noteId}::uuid AND user_id = ${user.user_id}::uuid AND deleted = 0
     `;

     const dbNote = result[0];
     if (!dbNote) {
       return NextResponse.json(
         { error: 'Note not found' },
         { status: 404 }
       );
     }

     // Map to NoteModel format
     const note = {
       id: dbNote.note_id,
       title: dbNote.title,
       content: dbNote.content,
       isFolder: dbNote.is_folder,
       s3Key: dbNote.s3_key,
       deleted: dbNote.deleted,
       shared: dbNote.shared,
       pinned: dbNote.pinned,
       editorsize: null,
       createdAt: dbNote.created_at ? new Date(dbNote.created_at).toISOString() : undefined,
       updatedAt: dbNote.updated_at ? new Date(dbNote.updated_at).toISOString() : undefined,
     };

    // Parse fields from query parameters
    const url = new URL(request.url);
    const fieldsParam = url.searchParams.get('fields');
    const fields = fieldsParam ? fieldsParam.split(',').map(f => f.trim()) : undefined;
    
    // Filter fields if requested
    const filtered = filterNoteFields(note, fields);

    return NextResponse.json(filtered);
  } catch (error) {
    console.error('Note GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch note' },
      { status: 500 }
    );
  }
}

export async function PUT(request, { params }) {
  try {
    // Get authenticated user
    const user = await validateSession();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const noteId = id;
    
    if (!isValidUUID(noteId)) {
      return NextResponse.json(
        { error: 'Invalid note ID' },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Get existing note (verify ownership)
    const result = await sql`
      SELECT * FROM app.notes
      WHERE note_id = ${noteId}::uuid AND user_id = ${user.user_id}::uuid AND deleted = 0
    `;

    const existingNote = result[0];
    if (!existingNote) {
      return NextResponse.json(
        { error: 'Note not found' },
        { status: 404 }
      );
    }

     // Update note
     const updatedNote = await sql`
       UPDATE app.notes
       SET title = ${body.title || existingNote.title},
           content = ${body.content || existingNote.content},
           updated_at = NOW()
       WHERE note_id = ${noteId}::uuid AND user_id = ${user.user_id}::uuid
       RETURNING note_id, title, content, is_folder, s3_key, deleted, shared, pinned, created_at, updated_at
     `;

     const dbNote = updatedNote[0];
     return NextResponse.json({
       id: dbNote.note_id,
       title: dbNote.title,
       content: dbNote.content,
       isFolder: dbNote.is_folder,
       s3Key: dbNote.s3_key,
       deleted: dbNote.deleted,
       shared: dbNote.shared,
       pinned: dbNote.pinned,
       editorsize: null,
       createdAt: dbNote.created_at ? new Date(dbNote.created_at).toISOString() : undefined,
       updatedAt: dbNote.updated_at ? new Date(dbNote.updated_at).toISOString() : undefined,
     });
  } catch (error) {
    console.error('Note PUT error:', error);
    return NextResponse.json(
      { error: 'Failed to update note' },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    // Get authenticated user
    const user = await validateSession();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const noteId = id;
    
    if (!isValidUUID(noteId)) {
      return NextResponse.json(
        { error: 'Invalid note ID' },
        { status: 400 }
      );
    }

    // Verify ownership and note exists
    const result = await sql`
      SELECT * FROM app.notes
      WHERE note_id = ${noteId}::uuid AND user_id = ${user.user_id}::uuid AND deleted = 0
    `;

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Note not found' },
        { status: 404 }
      );
    }

    // Soft delete note (set deleted flag and timestamp)
    await sql`
      UPDATE app.notes
      SET deleted = 1, deleted_at = NOW()
      WHERE note_id = ${noteId}::uuid AND user_id = ${user.user_id}::uuid
    `;

    // Remove from tree
    await removeNoteFromTree(user.user_id, noteId);

    // Delete all annotations for this note
    await deleteNoteAnnotations(user.user_id, noteId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Note DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to delete note' },
      { status: 500 }
    );
  }
}
