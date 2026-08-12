import type postgres from "postgres";
import sql from "@/database/pgsql";
import { getStorageProvider } from "@/lib/storage/init";
import logger from "@/lib/logger";
import { deleteChunkVectors } from "@/lib/qdrant";
import { isSharedImportedFileKey } from "@/lib/canvas/import-cache";
import { permanentlyDeleteNotes } from "@/lib/notes/storage/note-lifecycle";

interface TrashedRootRow {
  parent_id: string | null;
}

interface DeletedNoteRow {
  note_id: string;
  is_folder: boolean;
}

interface StorageRow {
  s3_key: string | null;
}

interface ChunkRow {
  id: string;
}

export interface PermanentNoteDeletion {
  noteIds: string[];
  folderIds: string[];
  parentId: string | null;
}

interface CommittedDeletion extends PermanentNoteDeletion {
  chunkIds: string[];
  storageKeys: string[];
}

function uniqueKeys(rows: StorageRow[]): string[] {
  return [
    ...new Set(
      rows
        .map((row) => row.s3_key)
        .filter((key): key is string => Boolean(key)),
    ),
  ];
}

async function deleteExternalResources(deletion: CommittedDeletion) {
  await deleteChunkVectors(deletion.chunkIds).catch((error) => {
    logger.warn("note cleanup Qdrant delete failed", {
      noteIds: deletion.noteIds,
      error,
    });
  });

  const storageKeys = deletion.storageKeys.filter(
    (key) => !isSharedImportedFileKey(key),
  );
  if (storageKeys.length === 0) return;

  let storage: ReturnType<typeof getStorageProvider>;
  try {
    storage = getStorageProvider();
  } catch (error) {
    logger.warn("note cleanup storage initialization failed", { error });
    return;
  }
  await Promise.all(
    storageKeys.map(async (key) => {
      try {
        await storage.deleteObject(key);
      } catch (error) {
        logger.warn("note cleanup S3 delete failed", { key, error });
      }
    }),
  );
}

/**
 * Permanently deletes one trashed note or the matching soft-delete cohort below
 * a trashed folder. Descendants deleted independently keep their notes and are
 * reparented before PostgreSQL can cascade their tree rows away.
 */
export async function permanentlyDeleteTrashedNote(
  userId: string,
  noteId: string,
): Promise<PermanentNoteDeletion | null> {
  const database = sql as postgres.Sql;
  const deletion = await database.begin<CommittedDeletion | null>(async (tx) => {
    const roots = await tx<TrashedRootRow[]>`
      SELECT tree.parent_id
      FROM app.notes note
      LEFT JOIN app.tree_items tree
        ON tree.note_id = note.note_id AND tree.user_id = note.user_id
      WHERE note.note_id = ${noteId}::uuid
        AND note.user_id = ${userId}::uuid
        AND note.deleted_at IS NOT NULL
      FOR UPDATE OF note
    `;
    const root = roots[0];
    if (!root) return null;

    const notes = await tx<DeletedNoteRow[]>`
      WITH RECURSIVE subtree(note_id) AS (
        SELECT ${noteId}::uuid
        UNION
        SELECT child.note_id
        FROM app.tree_items child
        JOIN subtree parent ON child.parent_id = parent.note_id
        WHERE child.user_id = ${userId}::uuid
      ),
      cohort AS MATERIALIZED (
        SELECT root.deleted_at
        FROM app.notes root
        WHERE root.note_id = ${noteId}::uuid
          AND root.user_id = ${userId}::uuid
          AND root.deleted_at IS NOT NULL
      )
      SELECT note.note_id, note.is_folder
      FROM app.notes note
      JOIN subtree ON subtree.note_id = note.note_id
      JOIN cohort ON note.deleted_at = cohort.deleted_at
      WHERE note.user_id = ${userId}::uuid
      FOR UPDATE OF note
    `;
    const noteIds = notes.map((note) => note.note_id);
    if (!noteIds.includes(noteId)) return null;

    const storageRows = await tx<StorageRow[]>`
      SELECT note.s3_key
      FROM app.notes note
      WHERE note.user_id = ${userId}::uuid
        AND note.note_id = ANY(${noteIds}::uuid[])
        AND note.s3_key IS NOT NULL
      UNION
      SELECT attachment.s3_key
      FROM app.attachments attachment
      WHERE attachment.user_id = ${userId}::uuid
        AND attachment.note_id = ANY(${noteIds}::uuid[])
        AND attachment.s3_key IS NOT NULL
      UNION
      SELECT marker.source_key
      FROM app.marker_jobs marker
      WHERE marker.user_id = ${userId}::uuid
        AND marker.note_id = ANY(${noteIds}::uuid[])
      UNION
      SELECT marker.result_key
      FROM app.marker_jobs marker
      WHERE marker.user_id = ${userId}::uuid
        AND marker.note_id = ANY(${noteIds}::uuid[])
    `;
    const chunkRows = await tx<ChunkRow[]>`
      SELECT id
      FROM app.chunks
      WHERE user_id = ${userId}::uuid
        AND document_id = ANY(${noteIds}::uuid[])
    `;

    // A parent_id foreign key cascades tree-row deletion. Move retained,
    // independently trashed descendant roots before deleting this cohort.
    await tx`
      UPDATE app.tree_items retained
      SET parent_id = ${root.parent_id}::uuid, updated_at = NOW()
      WHERE retained.user_id = ${userId}::uuid
        AND retained.parent_id = ANY(${noteIds}::uuid[])
        AND NOT (retained.note_id = ANY(${noteIds}::uuid[]))
    `;

    await tx`
      DELETE FROM app.chat_messages
      WHERE session_id IN (
        SELECT id
        FROM app.chat_sessions
        WHERE user_id = ${userId}::uuid
          AND note_id = ANY(${noteIds}::uuid[])
      )
    `;
    await tx`
      DELETE FROM app.chat_sessions
      WHERE user_id = ${userId}::uuid
        AND note_id = ANY(${noteIds}::uuid[])
    `;
    await tx`
      DELETE FROM app.quiz_sessions session
      WHERE session.user_id = ${userId}::uuid
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(session.card_ids) AS session_card(card_id)
          JOIN app.quiz_cards card ON card.id = session_card.card_id::uuid
          JOIN app.quiz_questions question ON question.id = card.question_id
          WHERE card.user_id = ${userId}::uuid
            AND question.user_id = ${userId}::uuid
            AND question.note_id = ANY(${noteIds}::uuid[])
        )
    `;
    await tx`
      DELETE FROM app.quiz_reviews
      WHERE user_id = ${userId}::uuid
        AND question_id IN (
          SELECT id
          FROM app.quiz_questions
          WHERE user_id = ${userId}::uuid
            AND note_id = ANY(${noteIds}::uuid[])
        )
    `;
    await tx`
      DELETE FROM app.quiz_cards
      WHERE user_id = ${userId}::uuid
        AND question_id IN (
          SELECT id
          FROM app.quiz_questions
          WHERE user_id = ${userId}::uuid
            AND note_id = ANY(${noteIds}::uuid[])
        )
    `;
    await tx`
      DELETE FROM app.quiz_questions
      WHERE user_id = ${userId}::uuid
        AND note_id = ANY(${noteIds}::uuid[])
    `;
    await tx`
      DELETE FROM app.chunks
      WHERE user_id = ${userId}::uuid
        AND document_id = ANY(${noteIds}::uuid[])
    `;
    await tx`
      DELETE FROM app.pdf_annotations
      WHERE user_id = ${userId}::uuid
        AND note_id = ANY(${noteIds}::uuid[])
    `;
    await tx`
      DELETE FROM app.attachments
      WHERE user_id = ${userId}::uuid
        AND note_id = ANY(${noteIds}::uuid[])
    `;
    await tx`
      DELETE FROM app.ingestion_jobs
      WHERE user_id = ${userId}::uuid
        AND note_id = ANY(${noteIds}::uuid[])
    `;
    await tx`
      UPDATE app.canvas_imports
      SET parent_folder_id = ${root.parent_id}::uuid, updated_at = NOW()
      WHERE user_id = ${userId}::uuid
        AND parent_folder_id = ANY(${noteIds}::uuid[])
        AND (note_id IS NULL OR NOT (note_id = ANY(${noteIds}::uuid[])))
    `;
    await tx`
      DELETE FROM app.canvas_imports
      WHERE user_id = ${userId}::uuid
        AND note_id = ANY(${noteIds}::uuid[])
    `;
    await tx`
      UPDATE app.canvas_import_jobs
      SET parent_folder_id = NULL, updated_at = NOW()
      WHERE user_id = ${userId}::uuid
        AND parent_folder_id = ANY(${noteIds}::uuid[])
    `;
    await tx`
      DELETE FROM app.tree_items
      WHERE user_id = ${userId}::uuid
        AND note_id = ANY(${noteIds}::uuid[])
    `;
    const deleted = await tx<DeletedNoteRow[]>`
      WITH cohort AS MATERIALIZED (
        SELECT root.deleted_at
        FROM app.notes root
        WHERE root.note_id = ${noteId}::uuid
          AND root.user_id = ${userId}::uuid
          AND root.deleted_at IS NOT NULL
      )
      DELETE FROM app.notes note
      USING cohort
      WHERE note.user_id = ${userId}::uuid
        AND note_id = ANY(${noteIds}::uuid[])
        AND note.deleted_at = cohort.deleted_at
      RETURNING note.note_id, note.is_folder
    `;

    return {
      noteIds: deleted.map((note) => note.note_id),
      folderIds: deleted
        .filter((note) => note.is_folder)
        .map((note) => note.note_id),
      parentId: root.parent_id,
      chunkIds: chunkRows.map((chunk) => chunk.id),
      storageKeys: uniqueKeys(storageRows),
    };
  });

  if (!deletion) return null;
  await deleteExternalResources(deletion);
  return {
    noteIds: deletion.noteIds,
    folderIds: deletion.folderIds,
    parentId: deletion.parentId,
  };
}

/**
 * Backward-compatible entry point for callers that have already resolved the
 * note IDs to remove. New lifecycle flows should use the durable cleanup path
 * directly so failed external work remains retryable.
 */
export async function cleanupNoteDependencies(
  userId: string,
  noteId: string,
): Promise<void> {
  await permanentlyDeleteNotes(userId, [noteId]);
}
