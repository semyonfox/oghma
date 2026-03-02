import { NextResponse } from 'next/server';
import { NoteModel } from '@/lib/notes/types/note';
import { getNoteFromS3, saveNoteToS3, deleteNoteFromS3 } from '@/lib/notes/storage/s3-storage';

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const note = await getNoteFromS3(id);

  if (!note) {
    return NextResponse.json(
      { error: 'Note not found' },
      { status: 404 }
    );
  }

  // Parse fields from query parameters
  const url = new URL(request.url);
  const fieldsParam = url.searchParams.get('fields');
  const fields = fieldsParam ? fieldsParam.split(',').map(f => f.trim()) : undefined;
  
  // Filter fields if requested
  const filtered = filterNoteFields(note, fields);

  return NextResponse.json(filtered);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  // Update note - merge with existing
  const existingNote = await getNoteFromS3(id);
  if (existingNote) {
    const updatedNote = { ...existingNote, ...body };
    await saveNoteToS3(updatedNote);
    return NextResponse.json(updatedNote);
  }

  return NextResponse.json(
    { error: 'Note not found' },
    { status: 404 }
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const existingNote = await getNoteFromS3(id);
  if (existingNote) {
    const updatedMeta = { ...existingNote, ...body };
    await saveNoteToS3(updatedMeta);
    return NextResponse.json(updatedMeta);
  }

  return NextResponse.json(
    { error: 'Note not found' },
    { status: 404 }
  );
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const existingNote = await getNoteFromS3(id);
  if (existingNote) {
    await deleteNoteFromS3(id);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json(
    { error: 'Note not found' },
    { status: 404 }
  );
}
