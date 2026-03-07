// PDF annotations storage - stores draw/markup data in PostgreSQL
import sql from '@/database/pgsql.js';

/**
 * Save or update PDF annotations
 */
export async function saveAnnotations(userId, noteId, attachmentId, annotationData) {
  try {
    // Check if annotations exist for this note
    const existing = await sql`
      SELECT id FROM app.pdf_annotations
      WHERE user_id = ${userId}
        AND note_id = ${noteId}
        AND attachment_id IS ${attachmentId}
      LIMIT 1
    `;

    let result;
    if (existing.length > 0) {
      // Update existing
      result = await sql`
        UPDATE app.pdf_annotations
        SET annotation_data = ${JSON.stringify(annotationData)},
            updated_at = NOW()
        WHERE id = ${existing[0].id}
        RETURNING *
      `;
    } else {
      // Insert new
      result = await sql`
        INSERT INTO app.pdf_annotations
        (user_id, note_id, attachment_id, annotation_data)
        VALUES (${userId}, ${noteId}, ${attachmentId}, ${JSON.stringify(annotationData)})
        RETURNING *
      `;
    }

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
      SELECT * FROM app.pdf_annotations
      WHERE user_id = ${userId}
        AND note_id = ${noteId}
        ${attachmentId !== undefined ? sql`AND attachment_id IS ${attachmentId}` : sql``}
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
      WHERE id = ${annotationId} AND user_id = ${userId}
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
      WHERE user_id = ${userId} AND note_id = ${noteId}
    `;
  } catch (error) {
    console.error('Error deleting note annotations:', error);
    throw error;
  }
}
