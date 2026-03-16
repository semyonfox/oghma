import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth.js';
import { addNoteToTree } from '@/lib/notes/storage/pg-tree.js';
import { generateUUID } from '@/lib/utils/uuid';
import sql from '@/database/pgsql.js';

// Constants
const NOTE_DELETED = { NORMAL: 0, DELETED: 1 };
const NOTE_PINNED = { UNPINNED: 0, PINNED: 1 };
const NOTE_SHARED = { PRIVATE: 0, SHARED: 1 };

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

    // Parse query parameters
    const url = new URL(request.url);
    const fieldsParam = url.searchParams.get('fields');
    const skipParam = url.searchParams.get('skip');
    const limitParam = url.searchParams.get('limit');
    
    // Parse fields from comma-separated string
    const fields = fieldsParam ? fieldsParam.split(',').map(f => f.trim()) : undefined;
    
    // Parse pagination
    const skip = skipParam ? parseInt(skipParam, 10) : 0;
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;
    
    // Get user's notes from PostgreSQL
    let notes = await sql`
      SELECT note_id, title, content, deleted, shared, pinned FROM app.notes
      WHERE user_id = ${user.user_id}::uuid AND deleted = 0 AND deleted_at IS NULL
      ORDER BY created_at DESC
    `;
    
    // Apply skip/limit for pagination
    if (skip > 0 || limit) {
      const end = limit ? skip + limit : undefined;
      notes = notes.slice(skip, end);
    }
    
    // Map to NoteModel format (rename note_id to id, convert numbers)
    const mapped = notes.map(note => ({
      id: note.note_id,
      title: note.title,
      content: note.content,
      deleted: note.deleted,
      shared: note.shared,
      pinned: note.pinned,
      editorsize: null,
    }));
    
    // Filter fields if requested
    const filtered = mapped.map(note => filterNoteFields(note, fields));
    
    return NextResponse.json(filtered);
  } catch (error) {
    console.error('Notes GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notes' },
      { status: 500 }
    );
  }
}

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
    
    // Generate UUID v7 for note
    const noteId = generateUUID();
    
    // Create new note in PostgreSQL
    const isFolder = body.isFolder === true || body.is_folder === true;
    const result = await sql`
      INSERT INTO app.notes (note_id, user_id, title, content, is_folder, deleted, created_at, updated_at)
      VALUES (${noteId}::uuid, ${user.user_id}::uuid, ${body.title || (isFolder ? 'New Folder' : 'Untitled')}, ${body.content || '\n'}, ${isFolder}, ${NOTE_DELETED.NORMAL}, NOW(), NOW())
      RETURNING note_id, user_id, title, content, is_folder, created_at, updated_at
    `;

    const note = result[0];

    // Add note to tree with optional parent_id from request body
    // If pid is provided, use it; otherwise add to root (parent_id = null)
    const parentId = body.pid || null;
    await addNoteToTree(user.user_id, note.note_id, parentId);

    return NextResponse.json({
      id: note.note_id,
      title: note.title,
      content: note.content,
      isFolder: note.is_folder,
      deleted: 0,  // NOTE_DELETED.NORMAL
      shared: 0,   // NOTE_SHARE.PRIVATE
      pinned: 0,   // NOTE_PINNED.UNPINNED
      editorsize: null,
    }, { status: 201 });
  } catch (error) {
    console.error('Notes POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create note' },
      { status: 500 }
    );
  }
}
