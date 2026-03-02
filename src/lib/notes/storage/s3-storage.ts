// S3-backed notes storage
import { getStorageProvider } from '@/lib/storage/init';
import { NoteModel } from '@/lib/notes/types/note';
import { TreeModel, TreeItemModel, ROOT_ID, DEFAULT_TREE } from '@/lib/notes/types/tree';

const NOTES_INDEX_PATH = 'notes/index.json';
const TREE_PATH = 'tree/tree.json';

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

/**
 * Get tree structure from S3
 */
export async function getTreeFromS3(): Promise<TreeModel> {
  try {
    const storage = getStorageProvider();
    const treeJson = await storage.getObject(TREE_PATH);
    if (!treeJson) {
      return DEFAULT_TREE;
    }
    return JSON.parse(treeJson) as TreeModel;
  } catch (error) {
    console.error('Error reading tree from S3:', error);
    return DEFAULT_TREE;
  }
}

/**
 * Save tree structure to S3
 */
export async function saveTreeToS3(tree: TreeModel): Promise<void> {
  try {
    const storage = getStorageProvider();
    const treeContent = JSON.stringify(tree, null, 2);
    await storage.putObject(TREE_PATH, treeContent, { contentType: 'application/json' });
  } catch (error) {
    console.error('Error saving tree to S3:', error);
    throw error;
  }
}

/**
 * Get user settings from S3
 */
export async function getSettingsFromS3(userId: number): Promise<Record<string, any>> {
  try {
    const storage = getStorageProvider();
    const settingsPath = `settings/${userId}/settings.json`;
    const settingsJson = await storage.getObject(settingsPath);
    if (!settingsJson) {
      return {}; // Return empty object if no settings exist
    }
    return JSON.parse(settingsJson) as Record<string, any>;
  } catch (error) {
    console.error(`Error reading settings for user ${userId} from S3:`, error);
    return {};
  }
}

/**
 * Save user settings to S3
 */
export async function saveSettingsToS3(userId: number, settings: Record<string, any>): Promise<void> {
  try {
    const storage = getStorageProvider();
    const settingsPath = `settings/${userId}/settings.json`;
    const settingsContent = JSON.stringify(settings, null, 2);
    await storage.putObject(settingsPath, settingsContent, { contentType: 'application/json' });
  } catch (error) {
    console.error(`Error saving settings for user ${userId} to S3:`, error);
    throw error;
  }
}

/**
 * Get trash (deleted notes) from S3
 */
export async function getTrashFromS3(): Promise<NoteModel[]> {
  try {
    const notes = await getAllNotesFromS3();
    // Filter notes that have been soft-deleted (deleted field set)
    return notes.filter((note) => note.deleted === 1);
  } catch (error) {
    console.error('Error reading trash from S3:', error);
    return [];
  }
}

/**
 * Restore a note from trash (un-soft-delete)
 */
export async function restoreNoteFromTrash(noteId: string): Promise<void> {
  try {
    const note = await getNoteFromS3(noteId);
    if (!note) {
      throw new Error(`Note ${noteId} not found`);
    }
    note.deleted = 0;
    await saveNoteToS3(note);
  } catch (error) {
    console.error(`Error restoring note ${noteId} from trash:`, error);
    throw error;
  }
}

/**
 * Permanently delete a note (hard delete)
 */
export async function permanentlyDeleteNote(noteId: string): Promise<void> {
  await deleteNoteFromS3(noteId);
}
