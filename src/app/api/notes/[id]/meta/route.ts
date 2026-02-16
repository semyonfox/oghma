import { NextResponse } from 'next/server';
import { MOCK_NOTES_STORAGE, syncTreeWithNotes } from '@/lib/notes/storage/mock-storage';

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