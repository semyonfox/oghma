import sql from "@/database/pgsql";

interface OrderedChunkHit {
  chunkId: string;
}

interface OwnedNoteChunkRow {
  chunk_id: string;
  note_id: string;
  title: string | null;
  chunk_text: string;
  canvas_course_id: string | number | null;
}

export interface HydratedOwnedNoteChunk<Hit extends OrderedChunkHit> {
  hit: Hit;
  chunkId: string;
  noteId: string;
  title: string | null;
  text: string;
  canvasCourseId: string | null;
}

export interface HydrateOwnedNoteChunksOptions {
  /** Search-result surfaces show one best chunk per note; RAG keeps context chunks. */
  uniqueNotes?: boolean;
}

/**
 * Resolves vector hits against the user's live note data. Missing or stale
 * vector records are ignored. Search-result callers can request one best
 * chunk per note, while context builders retain every ranked chunk.
 */
export async function hydrateOwnedNoteChunks<Hit extends OrderedChunkHit>(
  userId: string,
  hits: readonly Hit[],
  { uniqueNotes = false }: HydrateOwnedNoteChunksOptions = {},
): Promise<HydratedOwnedNoteChunk<Hit>[]> {
  if (hits.length === 0) return [];

  const chunkIds = hits.map((hit) => hit.chunkId);
  const rows = (await sql`
    SELECT
      c.id AS chunk_id,
      c.text AS chunk_text,
      n.note_id,
      n.title,
      n.canvas_course_id
    FROM app.chunks c
    JOIN app.notes n ON n.note_id = c.document_id
    WHERE c.user_id = ${userId}::uuid
      AND n.user_id = ${userId}::uuid
      AND c.id = ANY(${chunkIds}::uuid[])
      AND n.deleted_at IS NULL
      AND COALESCE(n.is_folder, false) = false
  `) as OwnedNoteChunkRow[];

  const rowsByChunkId = new Map(rows.map((row) => [row.chunk_id, row]));
  const seenNoteIds = uniqueNotes ? new Set<string>() : null;
  const hydrated: HydratedOwnedNoteChunk<Hit>[] = [];

  for (const hit of hits) {
    const row = rowsByChunkId.get(hit.chunkId);
    if (!row || seenNoteIds?.has(row.note_id)) continue;

    seenNoteIds?.add(row.note_id);
    hydrated.push({
      hit,
      chunkId: row.chunk_id,
      noteId: row.note_id,
      title: row.title,
      text: row.chunk_text,
      canvasCourseId:
        row.canvas_course_id == null ? null : String(row.canvas_course_id),
    });
  }

  return hydrated;
}
