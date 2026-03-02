// S3-backed notes storage
import { getStorageProvider } from '@/lib/storage/init';
import { NoteModel } from '@/lib/notes/types/note';

const NOTES_INDEX_PATH = 'notes/index.json';

/**
 * Get all notes from S3 index
 */
export async function getAllNotesFromS3(): Promise<NoteModel[]> {
  try {
    const storage = getStorageProvider();
    const indexJson = await storage.getObject(NOTES_INDEX_PATH);
    if (!indexJson) return [];
    const index = JSON.parse(indexJson) as { notes: Record<string, NoteModel> };
    return Object.values(index.notes);
  } catch (error) {
    console.error('Error reading notes index from S3:', error);
    return [];
  }
}

/**
 * Get a single note by ID from S3
 */
export async function getNoteFromS3(noteId: string): Promise<NoteModel | undefined> {
  try {
    const storage = getStorageProvider();
    const notePath = `notes/${noteId}/note.json`;
    const noteJson = await storage.getObject(notePath);
    if (!noteJson) return undefined;
    return JSON.parse(noteJson) as NoteModel;
  } catch (error) {
    console.error(`Error reading note ${noteId} from S3:`, error);
    return undefined;
  }
}

/**
 * Save a note to S3 and update index
 */
export async function saveNoteToS3(note: NoteModel): Promise<void> {
  try {
    const storage = getStorageProvider();
    
    // Save individual note
    const notePath = `notes/${note.id}/note.json`;
    await storage.putObject(notePath, JSON.stringify(note), { contentType: 'application/json' });
    
    // Update index
    const allNotes = await getAllNotesFromS3();
    const noteIndex = allNotes.reduce((acc, n) => {
      acc[n.id] = n;
      return acc;
    }, {} as Record<string, NoteModel>);
    
    noteIndex[note.id] = note;
    const indexContent = JSON.stringify({ notes: noteIndex }, null, 2);
    await storage.putObject(NOTES_INDEX_PATH, indexContent, { contentType: 'application/json' });
  } catch (error) {
    console.error(`Error saving note ${note.id} to S3:`, error);
    throw error;
  }
}

/**
 * Delete a note from S3 and update index
 */
export async function deleteNoteFromS3(noteId: string): Promise<void> {
  try {
    const storage = getStorageProvider();
    
    // Delete individual note
    const notePath = `notes/${noteId}/note.json`;
    await storage.deleteObject(notePath);
    
    // Update index
    const allNotes = await getAllNotesFromS3();
    const noteIndex = allNotes.reduce((acc, n) => {
      if (n.id !== noteId) {
        acc[n.id] = n;
      }
      return acc;
    }, {} as Record<string, NoteModel>);
    
    const indexContent = JSON.stringify({ notes: noteIndex }, null, 2);
    await storage.putObject(NOTES_INDEX_PATH, indexContent, { contentType: 'application/json' });
  } catch (error) {
    console.error(`Error deleting note ${noteId} from S3:`, error);
    throw error;
  }
}
