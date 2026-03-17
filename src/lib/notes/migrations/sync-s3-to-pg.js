// Sync S3 notes to PostgreSQL
// Migrates notes from S3 storage to PostgreSQL metadata database with UUID support
import { getAllNotesFromS3 } from '@/lib/notes/storage/s3-storage';
import sql from '@/database/pgsql.js';
import { addNoteToTree } from '@/lib/notes/storage/pg-tree';

/**
 * @typedef {Object} SyncResult
 * @property {boolean} success
 * @property {number} totalInS3
 * @property {number} alreadyInPG
 * @property {number} synced
 * @property {number} failed
 * @property {Array<{noteId: string, error: string}>} errors
 */

/**
 * Sync all notes from S3 to PostgreSQL
 * For each note in S3 that's not in PG, adds it with the correct UUID
 * Creates tree items for all synced notes
 * @param {string} userId
 * @returns {Promise<SyncResult>}
 */
export async function syncS3ToPG(userId) {
  const result = {
    success: false,
    totalInS3: 0,
    alreadyInPG: 0,
    synced: 0,
    failed: 0,
    errors: [],
  };

  try {
    // Get all notes from S3
    const s3Notes = await getAllNotesFromS3();
    result.totalInS3 = s3Notes.length;

    if (s3Notes.length === 0) {
      result.success = true;
      return result;
    }

    // Get notes already in PostgreSQL
    const pgNotes = await sql`
      SELECT note_id FROM app.notes 
      WHERE user_id = ${userId}::uuid
    `;
    const pgNoteIds = new Set(pgNotes.map(n => n.note_id));

    // Process each note from S3
    for (const s3Note of s3Notes) {
      try {
        const noteId = s3Note.id; // This should be UUID format already

        // Check if note already exists in PG
        if (pgNoteIds.has(noteId)) {
          result.alreadyInPG++;
          continue;
        }

        // Insert note into PostgreSQL
        await sql`
          INSERT INTO app.notes (
            note_id,
            user_id,
            title,
            content,
            deleted,
            deleted_at,
            shared,
            pinned,
            created_at,
            updated_at
          )
          VALUES (
            ${noteId}::uuid,
            ${userId}::uuid,
            ${s3Note.title || 'Untitled'},
            ${s3Note.content || ''},
            ${s3Note.deleted || 0},
            ${s3Note.deleted_at ? new Date(s3Note.deleted_at) : null},
            ${s3Note.shared || 0},
            ${s3Note.pinned || 0},
            ${s3Note.created_at ? new Date(s3Note.created_at) : new Date()},
            ${s3Note.updated_at ? new Date(s3Note.updated_at) : new Date()}
          )
          ON CONFLICT (note_id) DO NOTHING
        `;

        // Add to tree if not soft-deleted
        if (!s3Note.deleted) {
          const parentId = s3Note.pid || null;
          await addNoteToTree(userId, noteId, parentId);
        }

        result.synced++;
      } catch (error) {
        result.failed++;
        result.errors.push({
          noteId: s3Note.id,
          error: error instanceof Error ? error.message : String(error),
        });
        console.error(`Error syncing note ${s3Note.id}:`, error);
      }
    }

    result.success = true;
    return result;
  } catch (error) {
    console.error('Error in S3 to PG sync:', error);
    result.success = false;
    return result;
  }
}

/**
 * Check sync status without actually syncing
 * Returns counts of notes in S3 vs PostgreSQL
 * @param {string} userId
 * @returns {Promise<Object>}
 */
export async function checkSyncStatus(userId) {
  try {
    const s3Notes = await getAllNotesFromS3();
    const pgNotes = await sql`
      SELECT note_id FROM app.notes 
      WHERE user_id = ${userId}::uuid
    `;

    const pgNoteIds = new Set(pgNotes.map(n => n.note_id));
    const missingInPG = s3Notes.filter(n => !pgNoteIds.has(n.id));

    return {
      success: true,
      totalInS3: s3Notes.length,
      totalInPG: pgNotes.length,
      missingInPG: missingInPG.length,
      missingNoteIds: missingInPG.map(n => ({ id: n.id, title: n.title })),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
