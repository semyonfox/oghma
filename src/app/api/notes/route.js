import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth.js';
import { addNoteToTree } from '@/lib/notes/storage/pg-tree.js';
import { generateUUID } from '@/lib/utils/uuid';
import { filterNoteFields } from '@/lib/notes/utils/filter-fields';
import { mapNoteFromDB } from '@/lib/notes/utils/map-note';
import sql from '@/database/pgsql.js';
import logger from '@/lib/logger';

// Constants
const NOTE_DELETED = { NORMAL: 0, DELETED: 1 };
const NOTE_PINNED = { UNPINNED: 0, PINNED: 1 };
const NOTE_SHARED = { PRIVATE: 0, SHARED: 1 };
const MAX_TITLE_LENGTH = 500;
const MAX_CONTENT_LENGTH = 5 * 1024 * 1024; // 5MB

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
      SELECT note_id, title, content, is_folder, s3_key, deleted, shared, pinned, created_at, updated_at FROM app.notes
      WHERE user_id = ${user.user_id}::uuid AND deleted = 0 AND deleted_at IS NULL
      ORDER BY created_at DESC
    `;
    
    // Apply skip/limit for pagination
    if (skip > 0 || limit) {
      const end = limit ? skip + limit : undefined;
      notes = notes.slice(skip, end);
    }
    
    // Map to NoteModel format
    const mapped = notes.map(mapNoteFromDB);
    
    // Filter fields if requested
    const filtered = mapped.map(note => filterNoteFields(note, fields));
    
    return NextResponse.json(filtered);
  } catch (error) {
    logger.error('notes GET error', { error });
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

    // validate input lengths
    if (body.title && body.title.length > MAX_TITLE_LENGTH) {
      logger.warn('note title exceeds max length', { length: body.title.length });
      return NextResponse.json(
        { error: `Title must be ${MAX_TITLE_LENGTH} characters or fewer` },
        { status: 400 }
      );
    }
    if (body.content && body.content.length > MAX_CONTENT_LENGTH) {
      logger.warn('note content exceeds max length', { length: body.content.length });
      return NextResponse.json(
        { error: `Content must be ${MAX_CONTENT_LENGTH} bytes or fewer` },
        { status: 400 }
      );
    }

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
      createdAt: note.created_at ? new Date(note.created_at).toISOString() : undefined,
      updatedAt: note.updated_at ? new Date(note.updated_at).toISOString() : undefined,
    }, { status: 201 });
  } catch (error) {
    logger.error('notes POST error', { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create note' },
      { status: 500 }
    );
  }
}
