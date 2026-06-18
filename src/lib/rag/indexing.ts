import sql from "@/database/pgsql.js";
import { embedChunks } from "@/lib/embeddings";
import { deleteChunkVectors, upsertChunkVectors } from "@/lib/qdrant";
import { sanitizePostgresText } from "@/lib/text-sanitize";
import logger from "@/lib/logger";

interface ChunkRow {
  id: string;
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

async function deleteChunkSet(chunkIds: string[]): Promise<void> {
  if (chunkIds.length === 0) return;

  await deleteChunkVectors(chunkIds).catch(() => undefined);
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
    await sql`SELECT id FROM app.chunks WHERE document_id = ${noteId}::uuid AND user_id = ${userId}::uuid`;
  const chunkIds = chunkRows.map((row: ChunkRow) => row.id);
  await deleteChunkSet(chunkIds);
  return chunkIds.length;
}

export async function replaceNoteEmbeddings(
  noteId: string,
  userId: string,
  chunks: string[],
): Promise<number> {
  const normalizedChunks = normalizeChunksForIndexing(chunks);

  const oldChunks =
    await sql`SELECT id FROM app.chunks WHERE document_id = ${noteId}::uuid AND user_id = ${userId}::uuid`;
  const oldChunkIds = oldChunks.map((row: ChunkRow) => row.id);

  if (normalizedChunks.length === 0) {
    await deleteChunkSet(oldChunkIds);
    return 0;
  }

  const embeddings = await embedChunks(normalizedChunks);
  if (embeddings.length === 0) {
    await deleteChunkSet(oldChunkIds);
    return 0;
  }

  const chunkRows = await sql.begin(async (tx: any) => {
    return await tx`
      INSERT INTO app.chunks (document_id, user_id, text)
      SELECT * FROM UNNEST(
        ${embeddings.map(() => noteId)}::uuid[],
        ${embeddings.map(() => userId)}::uuid[],
        ${embeddings.map((entry) => entry.chunk)}::text[]
      )
      RETURNING id
    `;
  });

  try {
    await upsertChunkVectors(
      chunkRows.map((row: ChunkRow, index: number) => ({
        chunkId: row.id,
        documentId: noteId,
        userId,
        vector: embeddings[index].vector,
      })),
    );
  } catch (error) {
    await sql`DELETE FROM app.chunks WHERE id = ANY(${chunkRows.map((row: ChunkRow) => row.id)}::uuid[])`;
    throw error;
  }

  if (oldChunkIds.length > 0) {
    await deleteChunkVectors(oldChunkIds).catch(() => undefined);
    await deletePgEmbeddings(oldChunkIds);
    await sql`DELETE FROM app.chunks WHERE id = ANY(${oldChunkIds}::uuid[])`;
  }

  return embeddings.length;
}
