// PDF annotations storage - stores draw/markup data in PostgreSQL
import sql from '@/database/pgsql';

interface AnnotationRow {
  id: string;
  note_id: string;
  user_id: string;
  attachment_id: string | null;
  annotation_data: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface PdfAnnotation {
  id: string;
  noteId: string;
  userId: string;
  attachmentId: string | null;
  annotationData: unknown;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/** The note or attachment does not belong to the caller. */
export class AnnotationTargetNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnnotationTargetNotFoundError';
  }
}

function mapRow(row: AnnotationRow): PdfAnnotation {
  return {
    id: row.id,
    noteId: row.note_id,
    userId: row.user_id,
    attachmentId: row.attachment_id,
    annotationData: row.annotation_data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Save or replace the annotation document for one note/attachment pair.
 *
 * The unique index on (user_id, note_id, attachment_id) treats NULLs as
 * distinct, so ON CONFLICT never fires for note-level annotations. Locking the
 * owned note row serialises concurrent saves instead, and doubles as the
 * ownership check.
 */
export async function saveAnnotations(
  userId: string,
  noteId: string,
  attachmentId: string | null,
  annotationData: unknown,
): Promise<PdfAnnotation> {
  return sql.begin(async (tx) => {
    const notes = await tx<{ note_id: string }[]>`
      SELECT note_id FROM app.notes
      WHERE note_id = ${noteId}::uuid
        AND user_id = ${userId}::uuid
        AND deleted_at IS NULL
      FOR NO KEY UPDATE
    `;
    if (notes.length === 0) throw new AnnotationTargetNotFoundError('Note not found');

    if (attachmentId !== null) {
      const attachments = await tx<{ id: string }[]>`
        SELECT id FROM app.attachments
        WHERE id = ${attachmentId}::uuid
          AND note_id = ${noteId}::uuid
          AND user_id = ${userId}::uuid
      `;
      if (attachments.length === 0) throw new AnnotationTargetNotFoundError('Attachment not found');
    }

    const data = JSON.stringify(annotationData);
    const updated = await tx<AnnotationRow[]>`
      UPDATE app.pdf_annotations
      SET annotation_data = ${data}::text::jsonb,
          updated_at = NOW()
      WHERE user_id = ${userId}::uuid
        AND note_id = ${noteId}::uuid
        AND attachment_id IS NOT DISTINCT FROM ${attachmentId}::uuid
      RETURNING id, user_id, note_id, attachment_id, annotation_data, created_at, updated_at
    `;
    if (updated[0]) return mapRow(updated[0]);

    const inserted = await tx<AnnotationRow[]>`
      INSERT INTO app.pdf_annotations (user_id, note_id, attachment_id, annotation_data)
      VALUES (${userId}::uuid, ${noteId}::uuid, ${attachmentId}::uuid, ${data}::text::jsonb)
      RETURNING id, user_id, note_id, attachment_id, annotation_data, created_at, updated_at
    `;
    return mapRow(inserted[0]);
  });
}

/**
 * Get PDF annotations for a note. Without an attachment filter every
 * annotation on the note is returned, including note-level ones.
 */
export async function getAnnotations(
  userId: string,
  noteId: string,
  attachmentId?: string,
): Promise<PdfAnnotation[]> {
  const rows = await sql<AnnotationRow[]>`
    SELECT id, note_id, user_id, attachment_id, annotation_data, created_at, updated_at
    FROM app.pdf_annotations
    WHERE user_id = ${userId}::uuid
      AND note_id = ${noteId}::uuid
      ${attachmentId !== undefined ? sql`AND attachment_id = ${attachmentId}::uuid` : sql``}
    ORDER BY updated_at DESC
  `;
  return rows.map(mapRow);
}

/** Delete one annotation the caller owns. Returns false when nothing matched. */
export async function deleteAnnotations(
  userId: string,
  annotationId: string,
): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    DELETE FROM app.pdf_annotations
    WHERE id = ${annotationId}::uuid AND user_id = ${userId}::uuid
    RETURNING id
  `;
  return rows.length > 0;
}
