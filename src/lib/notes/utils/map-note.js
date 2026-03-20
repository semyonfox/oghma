/**
 * Maps a database note row to the NoteModel format.
 * Converts snake_case DB columns to camelCase properties.
 *
 * @param {Object} dbRow - Database row from app.notes table
 * @returns {Object} Note in NoteModel format
 */
export function mapNoteFromDB(dbRow) {
  return {
    id: dbRow.note_id,
    title: dbRow.title,
    content: dbRow.content,
    isFolder: dbRow.is_folder,
    s3Key: dbRow.s3_key,
    deleted: dbRow.deleted,
    shared: dbRow.shared,
    pinned: dbRow.pinned,
    editorsize: null,
    createdAt: dbRow.created_at ? new Date(dbRow.created_at).toISOString() : undefined,
    updatedAt: dbRow.updated_at ? new Date(dbRow.updated_at).toISOString() : undefined,
  };
}
