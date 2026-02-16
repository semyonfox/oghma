import { NextResponse } from 'next/server';
import { NoteModel } from '@/lib/notes/types/note';
import { NOTE_DELETED, NOTE_PINNED, NOTE_SHARED } from '@/lib/notes/types/meta';
import { MOCK_NOTES_STORAGE, addNoteToTree } from '@/lib/notes/storage/mock-storage';

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

  // Store in mock storage
  MOCK_NOTES_STORAGE.set(newNote.id, newNote);
  
  // Add to tree structure
  addNoteToTree(newNote.id, newNote.pid);

  return NextResponse.json(newNote, { status: 201 });
}
