import { NextResponse } from 'next/server';
import { getNoteFromS3, saveNoteToS3 } from '@/lib/notes/storage/s3-storage';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  try {
    const existingNote = await getNoteFromS3(id);
    if (!existingNote) {
      return NextResponse.json(
        { error: 'Note not found' },
        { status: 404 }
      );
    }

    const updatedNote = { ...existingNote, ...body };
    await saveNoteToS3(updatedNote);
    return NextResponse.json(updatedNote);
  } catch (error) {
    console.error(`Error updating meta for note ${id}:`, error);
    return NextResponse.json(
      { error: 'Failed to update note metadata' },
      { status: 500 }
    );
  }
}
