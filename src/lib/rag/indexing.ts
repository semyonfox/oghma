import sql from "@/database/pgsql";
import { embedChunks } from "@/lib/embeddings";
import {
  deleteChunkVectors,
  setChunkVectorsSearchable,
  upsertChunkVectors,
} from "@/lib/qdrant";
import { sanitizePostgresText } from "@/lib/text-sanitize";
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

async function deleteVectorsOrJournal(chunkIds: string[], userId: string): Promise<void> {
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

async function deleteChunkSet(chunkIds: string[], userId: string): Promise<void> {
  if (chunkIds.length === 0) return;

  await deleteVectorsOrJournal(chunkIds, userId);
  await deletePgEmbeddings(chunkIds);
  await sql`DELETE FROM app.chunks WHERE id = ANY(${chunkIds}::uuid[])`;
}

async function deletePgEmbeddings(chunkIds: string[]): Promise<void> {
  if (chunkIds.length === 0) return;

  try {
    const [table] = await sql`SELECT to_regclass('app.embeddings') AS table_name`;
    if (!table?.table_name) return;

    await sql`
      DELETE FROM app.embeddings
      WHERE chunk_id = ANY(${chunkIds}::uuid[])
    `;
  } catch (error) {
    logger.warn("pg embedding cleanup failed", { error });
  }
}

export async function deleteNoteRagIndex(
  noteId: string,
  userId: string,
): Promise<number> {
  const chunkRows =
    await sql<ChunkRow[]>`SELECT id FROM app.chunks WHERE document_id = ${noteId}::uuid AND user_id = ${userId}::uuid`;
  const chunkIds = chunkRows.map((row) => row.id);
  await deleteChunkSet(chunkIds, userId);
  return chunkIds.length;
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

  const embeddings = await embedChunks(normalizedChunks);
  if (embeddings.length === 0) {
    const oldChunkIds = await getActiveNoteChunkIds(noteId, userId);
    if (!oldChunkIds) return 0;
    await deleteChunkSet(oldChunkIds, userId);
    return 0;
  }

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
      const chunkRows = await tx<ChunkRow[]>`
        INSERT INTO app.chunks (document_id, user_id, text)
        SELECT * FROM UNNEST(
          ${embeddings.map(() => noteId)}::uuid[],
          ${embeddings.map(() => userId)}::uuid[],
          ${embeddings.map((entry) => entry.chunk)}::text[]
        )
        RETURNING id
      `;
      insertedChunkIds = chunkRows.map((row) => row.id);

      await upsertChunkVectors(
        chunkRows.map((row, index) => ({
          chunkId: row.id,
          documentId: noteId,
          userId,
          vector: embeddings[index].vector,
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
