// Auto-sync S3 notes to PostgreSQL on app startup
// This ensures all notes stay synced without manual intervention

import sql from '@/database/pgsql.js';
import { getAllNotesFromS3 } from '@/lib/notes/storage/s3-storage';
import { isValidUUID } from '@/lib/uuid-validation';

function generateUUIDForId(id) {
  // Generate deterministic UUID based on old ID
  const crypto = require('crypto');
  const hash = crypto.createHash('sha1');
  hash.update(id);
  const digest = hash.digest();

  digest[6] = (digest[6] & 0x0f) | 0x50; // Set version to 5
  digest[8] = (digest[8] & 0x3f) | 0x80; // Set variant

  const hex = digest.toString('hex');
  return `${hex.substr(0, 8)}-${hex.substr(8, 4)}-${hex.substr(12, 4)}-${hex.substr(16, 4)}-${hex.substr(20, 12)}`;
}

/**
 * Background sync: Run in background without blocking
 * Syncs notes from S3 to PostgreSQL for all users
 */
export async function runBackgroundSync() {
  try {
    console.log('[Sync] Starting background S3→PostgreSQL sync...');

    const s3Notes = await getAllNotesFromS3();
    if (s3Notes.length === 0) {
      console.log('[Sync] No notes in S3 to sync');
      return { success: true, synced: 0 };
    }

    // Get all users
    const users = await sql`SELECT user_id FROM app.login`;
    let totalSynced = 0;

    for (const user of users) {
      // Get notes already in this user's database
      const pgNotes = await sql`
        SELECT note_id FROM app.notes 
        WHERE user_id = ${user.user_id}::uuid
      `;
      const pgNoteIds = new Set(pgNotes.map(n => n.note_id));

      // Sync missing notes
      for (const s3Note of s3Notes) {
        try {
          // Convert old ID to UUID if needed
          let noteId = s3Note.id;
          if (!isValidUUID(noteId)) {
            noteId = generateUUIDForId(noteId);
          }

          // Skip if already in database
          if (pgNoteIds.has(noteId)) {
            continue;
          }

          // Insert into database
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
              ${user.user_id}::uuid,
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
          totalSynced++;
        } catch (error) {
          console.error(`[Sync] Error syncing note ${s3Note.id}:`, error.message);
        }
      }
    }

    console.log(`[Sync] Background sync complete: ${totalSynced} notes synced`);
    return { success: true, synced: totalSynced };
  } catch (error) {
    console.error('[Sync] Background sync error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Initialize background sync
 * Call this once on app startup
 */
export async function initAutoSync() {
  // Run sync in background (don't await, don't block startup)
  runBackgroundSync().catch(error => {
    console.error('[Sync] Auto-sync initialization error:', error);
  });
}
