import sql from "@/database/pgsql.js";
import { getStorageProvider } from "@/lib/storage/init";
import logger from "@/lib/logger";

function uniqueKeys(rows: Array<{ s3_key: string | null }>): string[] {
  return [...new Set(rows.map((row) => row.s3_key).filter(Boolean))] as string[];
}

// permanently clean up all dependencies of a note before final deletion.
// only call this on permanent delete from trash — NOT on soft-delete,
// since soft-deleted notes can be restored and should keep their data.
export async function cleanupNoteDependencies(
  userId: string,
  noteId: string,
): Promise<void> {
  // collect S3 keys before deleting rows
  const storageRows = await sql`
    SELECT s3_key
    FROM app.notes
    WHERE note_id = ${noteId}::uuid
      AND user_id = ${userId}::uuid
      AND s3_key IS NOT NULL
    UNION
    SELECT s3_key
    FROM app.attachments
    WHERE note_id = ${noteId}::uuid
      AND user_id = ${userId}::uuid
      AND s3_key IS NOT NULL
  `;

  // delete all DB dependencies in a single transaction
  await sql.begin(async (tx) => {
    await tx`
      DELETE FROM app.chat_messages
      WHERE session_id IN (
        SELECT id FROM app.chat_sessions
        WHERE user_id = ${userId}::uuid AND note_id = ${noteId}::uuid
      )
    `;

    await tx`
      DELETE FROM app.chat_sessions
      WHERE user_id = ${userId}::uuid AND note_id = ${noteId}::uuid
    `;

    await tx`
      DELETE FROM app.quiz_sessions qs
      WHERE qs.user_id = ${userId}::uuid
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(qs.card_ids) AS session_card(card_id)
          JOIN app.quiz_cards qc ON qc.id = session_card.card_id::uuid
          JOIN app.quiz_questions qq ON qq.id = qc.question_id
          WHERE qc.user_id = ${userId}::uuid
            AND qq.user_id = ${userId}::uuid
            AND qq.note_id = ${noteId}::uuid
        )
    `;

    await tx`
      DELETE FROM app.quiz_reviews
      WHERE user_id = ${userId}::uuid
        AND question_id IN (
          SELECT id FROM app.quiz_questions
          WHERE user_id = ${userId}::uuid AND note_id = ${noteId}::uuid
        )
    `;

    await tx`
      DELETE FROM app.quiz_cards
      WHERE user_id = ${userId}::uuid
        AND question_id IN (
          SELECT id FROM app.quiz_questions
          WHERE user_id = ${userId}::uuid AND note_id = ${noteId}::uuid
        )
    `;

    await tx`
      DELETE FROM app.quiz_questions
      WHERE user_id = ${userId}::uuid AND note_id = ${noteId}::uuid
    `;

    await tx`
      DELETE FROM app.embeddings
      WHERE chunk_id IN (
        SELECT id FROM app.chunks
        WHERE document_id = ${noteId}::uuid AND user_id = ${userId}::uuid
      )
    `;

    await tx`
      DELETE FROM app.chunks
      WHERE document_id = ${noteId}::uuid AND user_id = ${userId}::uuid
    `;

    await tx`
      DELETE FROM app.pdf_annotations
      WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
    `;

    await tx`
      DELETE FROM app.attachments
      WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
    `;

    await tx`
      DELETE FROM app.ingestion_jobs
      WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
    `;

    await tx`
      DELETE FROM app.canvas_imports
      WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
    `;

    await tx`
      DELETE FROM app.tree_items
      WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
    `;
  });

  // best-effort S3 cleanup after transaction commits
  const storageKeys = uniqueKeys(storageRows as Array<{ s3_key: string | null }>);
  if (storageKeys.length === 0) return;

  const storage = getStorageProvider();
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
