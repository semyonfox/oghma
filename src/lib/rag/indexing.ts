import sql from "@/database/pgsql.js";
import { embedChunks } from "@/lib/embeddings";

interface ChunkRow {
  id: string;
}

export function normalizeChunksForIndexing(chunks: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const chunk of chunks) {
    const trimmed = chunk?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

async function deleteChunkSet(chunkIds: string[]): Promise<void> {
  if (chunkIds.length === 0) return;

  await sql`DELETE FROM app.embeddings WHERE chunk_id = ANY(${chunkIds}::uuid[])`;
  await sql`DELETE FROM app.chunks WHERE id = ANY(${chunkIds}::uuid[])`;
}

export async function replaceNoteEmbeddings(
  noteId: string,
  userId: string,
  chunks: string[],
): Promise<number> {
  const normalizedChunks = normalizeChunksForIndexing(chunks);

  const oldChunks =
    await sql`SELECT id FROM app.chunks WHERE document_id = ${noteId}::uuid`;
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

  // atomic: insert new chunks+embeddings and delete old ones in one transaction
  // prevents orphaned chunks if the embedding INSERT fails mid-flight
  await sql.begin(async (tx: any) => {
    const chunkRows = await tx`
      INSERT INTO app.chunks (document_id, user_id, text)
      SELECT * FROM UNNEST(
        ${embeddings.map(() => noteId)}::uuid[],
        ${embeddings.map(() => userId)}::uuid[],
        ${embeddings.map((entry) => entry.chunk)}::text[]
      )
      RETURNING id
    `;

    await tx`
      INSERT INTO app.embeddings (chunk_id, embedding)
      SELECT * FROM UNNEST(
        ${chunkRows.map((row: ChunkRow) => row.id)}::uuid[],
        ${embeddings.map((entry) => JSON.stringify(entry.vector))}::vector[]
      )
    `;

    if (oldChunkIds.length > 0) {
      await tx`DELETE FROM app.embeddings WHERE chunk_id = ANY(${oldChunkIds}::uuid[])`;
      await tx`DELETE FROM app.chunks WHERE id = ANY(${oldChunkIds}::uuid[])`;
    }
  });

  return embeddings.length;
}
