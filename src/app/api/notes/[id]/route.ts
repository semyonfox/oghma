import { NextResponse } from 'next/server';
import { NoteModel } from '@/lib/notes/types/note';
import { MOCK_NOTES_STORAGE, syncTreeWithNotes, removeNoteFromTree } from '@/lib/notes/storage/mock-storage';

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

  return NextResponse.json(note);
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
