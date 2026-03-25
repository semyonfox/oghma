// Sync S3 notes to PostgreSQL
// DEPRECATED: All data is now stored in PostgreSQL. S3 is used for binary file storage only.
// These functions remain for backward compatibility but return empty results.

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
 * DEPRECATED: Sync from S3 no longer supported
 * All data is now in PostgreSQL; S3 is only used for file storage
 * @param {string} userId
 * @returns {Promise<SyncResult>}
 */
export async function syncS3ToPG(userId) {
  return {
    success: true,
    totalInS3: 0,
    alreadyInPG: 0,
    synced: 0,
    failed: 0,
    errors: [],
    message: 'S3 to PG sync is no longer supported. All data is stored in PostgreSQL.',
  };
}

/**
 * DEPRECATED: Check sync status
 * Returns empty status since sync is no longer supported
 * @param {string} userId
 * @returns {Promise<Object>}
 */
export async function checkSyncStatus(userId) {
  return {
    success: true,
    totalInS3: 0,
    totalInPG: 0,
    missingInPG: 0,
    missingNoteIds: [],
    message: 'S3 to PG sync is no longer supported. All data is stored in PostgreSQL.',
  };
}
