import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth.js';
import { addNoteToTree } from '@/lib/notes/storage/pg-tree.js';
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
      SELECT * FROM app.notes
      WHERE user_id = ${user.user_id} AND deleted = 0
      ORDER BY created_at DESC
    `;
    
    // Apply skip/limit for pagination
    if (skip > 0 || limit) {
      const end = limit ? skip + limit : undefined;
      notes = notes.slice(skip, end);
    }
    
    // Filter fields if requested
    const filtered = notes.map(note => filterNoteFields(note, fields));
    
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
    
    // Create new note in PostgreSQL
    const result = await sql`
      INSERT INTO app.notes (user_id, title, content, deleted, created_at, updated_at)
      VALUES (${user.user_id}, ${body.title || 'Untitled'}, ${body.content || '\n'}, ${NOTE_DELETED.NORMAL}, NOW(), NOW())
      RETURNING note_id, user_id, title, content, created_at, updated_at
    `;

    const note = result[0];

    // Add note to tree (in root if no parent specified)
    const parentId = body.pid ? parseInt(body.pid, 10) : null;
    await addNoteToTree(user.user_id, note.note_id, parentId);

    return NextResponse.json({
      note_id: note.note_id,
      user_id: note.user_id,
      title: note.title,
      content: note.content,
      created_at: note.created_at,
      updated_at: note.updated_at,
    }, { status: 201 });
  } catch (error) {
    console.error('Notes POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create note' },
      { status: 500 }
    );
  }
}
