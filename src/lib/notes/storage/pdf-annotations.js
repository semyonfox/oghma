// PDF annotations storage - stores draw/markup data in PostgreSQL
import sql from '@/database/pgsql.js';

/**
 * Save or update PDF annotations
 */
export async function saveAnnotations(userId, noteId, attachmentId, annotationData) {
  try {
    const result = await sql`
      INSERT INTO app.pdf_annotations (user_id, note_id, attachment_id, annotation_data)
      VALUES (${userId}::uuid, ${noteId}::uuid, ${attachmentId}::uuid, ${JSON.stringify(annotationData)})
      ON CONFLICT (user_id, note_id, attachment_id) DO UPDATE
      SET annotation_data = EXCLUDED.annotation_data,
          updated_at = NOW()
      RETURNING id, user_id, note_id, attachment_id, annotation_data, created_at, updated_at
    `;

    return result[0];
  } catch (error) {
    console.error('Error saving PDF annotations:', error);
    throw error;
  }
}

/**
 * Get PDF annotations for a note
 */
export async function getAnnotations(userId, noteId, attachmentId) {
  try {
    const rows = await sql`
      SELECT id, note_id, user_id, attachment_id, annotation_data, created_at, updated_at
      FROM app.pdf_annotations
      WHERE user_id = ${userId}::uuid
        AND note_id = ${noteId}::uuid
        ${attachmentId !== undefined ? sql`AND attachment_id = ${attachmentId}::uuid` : sql``}
      ORDER BY updated_at DESC
    `;

    return rows.map(row => ({
      id: row.id,
      noteId: row.note_id,
      userId: row.user_id,
      attachmentId: row.attachment_id,
      annotationData: row.annotation_data,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (error) {
    console.error('Error retrieving PDF annotations:', error);
    return [];
  }
}

/**
 * Delete PDF annotations
 */
export async function deleteAnnotations(userId, annotationId) {
  try {
    await sql`
      DELETE FROM app.pdf_annotations
      WHERE id = ${annotationId} AND user_id = ${userId}::uuid
    `;
  } catch (error) {
    console.error('Error deleting PDF annotations:', error);
    throw error;
  }
}

/**
 * Delete all annotations for a note (when note is deleted)
 */
export async function deleteNoteAnnotations(userId, noteId) {
  try {
    await sql`
      DELETE FROM app.pdf_annotations
      WHERE user_id = ${userId}::uuid AND note_id = ${noteId}::uuid
    `;
  } catch (error) {
    console.error('Error deleting note annotations:', error);
    throw error;
  }
}
