import { NextResponse } from 'next/server';
import { NoteModel } from '@/lib/notes/types/note';
import { MOCK_NOTES_STORAGE, syncTreeWithNotes, removeNoteFromTree } from '@/lib/notes/storage/mock-storage';

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
  const note = MOCK_NOTES_STORAGE.get(id);

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

  // Mock update - merge with existing note
  const existingNote = MOCK_NOTES_STORAGE.get(id);
  if (existingNote) {
    const updatedNote = { ...existingNote, ...body };
    MOCK_NOTES_STORAGE.set(id, updatedNote);
    syncTreeWithNotes(); // Sync tree with updated note
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

  const existingNote = MOCK_NOTES_STORAGE.get(id);
  if (existingNote) {
    const updatedMeta = { ...existingNote, ...body };
    MOCK_NOTES_STORAGE.set(id, updatedMeta);
    syncTreeWithNotes(); // Sync tree with updated metadata
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

  if (MOCK_NOTES_STORAGE.has(id)) {
    MOCK_NOTES_STORAGE.delete(id);
    removeNoteFromTree(id); // Remove from tree structure
    return NextResponse.json({ success: true });
  }

  return NextResponse.json(
    { error: 'Note not found' },
    { status: 404 }
  );
}
