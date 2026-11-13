import postgres from "postgres";
import sql, { afterDatabaseCommit, afterDatabaseRollback } from "@/database/pgsql";
import { embedChunks } from "@/lib/rag/embeddings";
import {
  deleteChunkVectors,
  setChunkVectorsSearchable,
  upsertChunkVectors,
} from "@/lib/qdrant";
import { sanitizePostgresText } from "@/lib/text-sanitize";
import { generateUUID } from "@/lib/utils/uuid";
import logger from "@/lib/logger";

interface ChunkRow {
  id: string;
}

interface NoteRow {
  note_id: string;
}

interface InsertedChunkSet {
  chunkIds: string[];
  oldChunkIds: string[];
}

export function normalizeChunksForIndexing(chunks: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const chunk of chunks) {
    const trimmed = sanitizePostgresText(chunk ?? "").trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

/**
 * Delete vectors now, or journal their ids for the deletion collector when
 * Qdrant is unreachable. A silently dropped delete leaves user-scoped orphans
 * that still match the owner's filter and use up top-K recall.
 */
export async function deleteVectorsOrJournal(chunkIds: string[], userId: string): Promise<void> {
  if (chunkIds.length === 0) return;
  try {
    await deleteChunkVectors(chunkIds);
  } catch {
    // Keep exact vector IDs after relational rows disappear. The existing
    // lifecycle collector retries these idempotent deletes after recovery.
    await sql`
      INSERT INTO app.note_deletion_cleanup_tasks (user_id, chunk_ids)
      VALUES (${userId}::uuid, ${chunkIds}::uuid[])
    `;
  }
}

async function dropUnreviewedGeneratedQuestions(
  db: postgres.TransactionSql,
  userId: string,
  chunkIds: string[],
): Promise<void> {
  if (chunkIds.length === 0) return;
  await db`
    DELETE FROM app.quiz_questions qq
    WHERE qq.user_id = ${userId}::uuid
      AND qq.origin = 'generated'
      AND qq.chunk_id = ANY(${chunkIds}::uuid[])
      AND NOT EXISTS (
        SELECT 1 FROM app.quiz_reviews qr
        WHERE qr.user_id = qq.user_id AND qr.question_id = qq.id
      )
  `;
}

async function deleteChunkSet(chunkIds: string[], userId: string): Promise<void> {
  if (chunkIds.length === 0) return;

  await afterDatabaseCommit(() => deleteVectorsOrJournal(chunkIds, userId));
  await sql.begin(async (tx: postgres.TransactionSql) => {
    await dropUnreviewedGeneratedQuestions(tx, userId, chunkIds);
    await tx`DELETE FROM app.chunks WHERE id = ANY(${chunkIds}::uuid[])`;
  });
}

// Sessions select cards by note, so a question left on a replaced chunk stays
// in the deck while the new chunk looks uncovered and gets a second card.
// Move generated questions onto the new chunk when the text matches once on
// each side. Drop never-reviewed questions whose text changed. Reviewed
// questions stay: chunk_id is provenance, not a foreign key.
async function carryGeneratedQuestions(
  tx: postgres.TransactionSql,
  userId: string,
  oldChunkIds: string[],
  newChunkIds: string[],
): Promise<void> {
  if (oldChunkIds.length === 0) return;
  await tx`
    WITH old AS (
      SELECT id, text, count(*) OVER (PARTITION BY text) AS copies
      FROM app.chunks WHERE id = ANY(${oldChunkIds}::uuid[])
    ),
    fresh AS (
      SELECT id, text, count(*) OVER (PARTITION BY text) AS copies
      FROM app.chunks WHERE id = ANY(${newChunkIds}::uuid[])
    )
    UPDATE app.quiz_questions qq
    SET chunk_id = fresh.id
    FROM old JOIN fresh ON fresh.text = old.text
    WHERE old.copies = 1 AND fresh.copies = 1
      AND qq.user_id = ${userId}::uuid
      AND qq.origin = 'generated'
      AND qq.chunk_id = old.id
  `;
  await dropUnreviewedGeneratedQuestions(tx, userId, oldChunkIds);
}

export async function replaceNoteEmbeddings(
  noteId: string,
  userId: string,
  chunks: string[],
): Promise<number> {
  const normalizedChunks = normalizeChunksForIndexing(chunks);

  if (normalizedChunks.length === 0) {
    const oldChunkIds = await getActiveNoteChunkIds(noteId, userId);
    if (!oldChunkIds) return 0;
    await deleteChunkSet(oldChunkIds, userId);
    return 0;
  }

  // ids are minted here rather than read back from RETURNING, whose row order
  // Postgres does not promise, so each vector is pinned to its own chunk text.
  // v7 ids also sort in document order within the note
  const newChunks = (await embedChunks(normalizedChunks)).map((entry) => ({
    id: generateUUID(),
    text: entry.chunk,
    vector: entry.vector,
  }));

  let insertedChunkIds: string[] = [];
  let inserted: InsertedChunkSet | null;

  try {
    inserted = await sql.begin<InsertedChunkSet | null>(async (tx) => {
      // Hold the note row lock through the external write. Trash/permanent
      // deletion takes the same fence, so it cannot leave a newly published
      // vector attached to a note it has already removed.
      const activeNotes = await tx<NoteRow[]>`
        SELECT note_id
        FROM app.notes
        WHERE note_id = ${noteId}::uuid
          AND user_id = ${userId}::uuid
          AND deleted_at IS NULL
        FOR UPDATE
      `;
      if (activeNotes.length === 0) return null;

      const oldChunks = await tx<ChunkRow[]>`
        SELECT id
        FROM app.chunks
        WHERE document_id = ${noteId}::uuid
          AND user_id = ${userId}::uuid
      `;
      const chunkIds = newChunks.map((chunk) => chunk.id);
      await tx`
        INSERT INTO app.chunks (id, document_id, user_id, text)
        SELECT * FROM UNNEST(
          ${chunkIds}::uuid[],
          ${newChunks.map(() => noteId)}::uuid[],
          ${newChunks.map(() => userId)}::uuid[],
          ${newChunks.map((chunk) => chunk.text)}::text[]
        )
      `;
      insertedChunkIds = chunkIds;
      const oldChunkIds = oldChunks.map((row) => row.id);
      await carryGeneratedQuestions(tx, userId, oldChunkIds, chunkIds);
      // Drop the old rows before commit. A later delete leaves them uncovered
      // long enough for generation to mint a second card on the same text.
      if (oldChunkIds.length > 0) {
        await tx`
          DELETE FROM app.chunks
          WHERE user_id = ${userId}::uuid
            AND id = ANY(${oldChunkIds}::uuid[])
        `;
      }
      afterDatabaseRollback(() => deleteVectorsOrJournal(chunkIds, userId));

      await upsertChunkVectors(
        newChunks.map((chunk) => ({
          chunkId: chunk.id,
          documentId: noteId,
          userId,
          vector: chunk.vector,
        })),
      );

      return {
        chunkIds: insertedChunkIds,
        oldChunkIds: oldChunks.map((row) => row.id),
      };
    });
  } catch (error) {
    // A failed transaction rolls back Postgres, but Qdrant may have accepted
    // a partial write before the error reached us.
    if (insertedChunkIds.length > 0) {
      await deleteVectorsOrJournal(insertedChunkIds, userId).catch((cleanupError) => {
        logger.warn("Qdrant rollback cleanup failed", {
          noteId,
          chunkIds: insertedChunkIds,
          error: cleanupError,
        });
      });
    }
    throw error;
  }

  if (!inserted) return 0;

  // A soft-delete can start immediately after the transaction commits. Keep
  // its vectors out of search until its durable cleanup completes.
  const noteStates = await sql`
    SELECT deleted_at IS NULL AS active
    FROM app.notes
    WHERE note_id = ${noteId}::uuid
      AND user_id = ${userId}::uuid
  `;
  const noteState = noteStates?.[0];
  if (noteState && !noteState.active) {
    await setChunkVectorsSearchable(
      inserted.chunkIds,
      false,
    ).catch((error) => {
      logger.warn("trashed note vector visibility reconciliation failed", {
        noteId,
        error,
      });
    });
  }

  await deleteChunkSet(inserted.oldChunkIds, userId);

  return inserted.chunkIds.length;
}

async function getActiveNoteChunkIds(
  noteId: string,
  userId: string,
): Promise<string[] | null> {
  return sql.begin(async (tx) => {
    const activeNotes = await tx<NoteRow[]>`
      SELECT note_id
      FROM app.notes
      WHERE note_id = ${noteId}::uuid
        AND user_id = ${userId}::uuid
        AND deleted_at IS NULL
      FOR UPDATE
    `;
    if (activeNotes.length === 0) return null;

    const chunks = await tx<ChunkRow[]>`
      SELECT id
      FROM app.chunks
      WHERE document_id = ${noteId}::uuid
        AND user_id = ${userId}::uuid
    `;
    return chunks.map((row) => row.id);
  });
}
