import { NextResponse } from 'next/server';
import { NoteModel } from '@/lib/notes/types/note';
import { NOTE_DELETED, NOTE_PINNED, NOTE_SHARED } from '@/lib/notes/types/meta';
import { getAllNotesFromS3, saveNoteToS3 } from '@/lib/notes/storage/s3-storage';

/**
 * Helper: Filter note to only include requested fields
 */
function filterNoteFields(note: NoteModel, fields?: string[]): Partial<NoteModel> {
  if (!fields || fields.length === 0) {
    return note;
  }
  
  const filtered: any = {};
  for (const field of fields) {
    if (field in note) {
      filtered[field] = (note as any)[field];
    }
  }
  return filtered;
}

export async function GET(request: Request) {
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
  
  // Get all notes from S3 and apply pagination
  let notes = await getAllNotesFromS3();
  
  // Apply skip/limit for pagination
  if (skip > 0 || limit) {
    const end = limit ? skip + limit : undefined;
    notes = notes.slice(skip, end);
  }
  
  // Filter fields if requested
  const filtered = notes.map(note => filterNoteFields(note, fields));
  
  return NextResponse.json(filtered);
}

export async function POST(request: Request) {
  const body = await request.json();
  
  // Create new note with defaults
  const newNote: NoteModel = {
    id: body.id || `note-${Date.now()}`,
    title: body.title || 'Untitled',
    content: body.content || '\n',
    deleted: NOTE_DELETED.NORMAL,
    pinned: body.pinned || NOTE_PINNED.UNPINNED,
    shared: body.shared || NOTE_SHARED.PRIVATE,
    editorsize: body.editorsize || null,
    pid: body.pid || undefined,
  };

  // Store in S3
  await saveNoteToS3(newNote);

  return NextResponse.json(newNote, { status: 201 });
}
