import sql from "@/database/pgsql";
import { embedText } from "@/lib/embedText";
import { searchChunkVectors } from "@/lib/qdrant";
import { getChatMaxDistance } from "@/lib/ai-config";
import { Metrics } from "@/lib/metrics";
import { hydrateOwnedNoteChunks } from "@/lib/search/owned-note-chunks";

const MAX_RESULTS = 12;
const QUERY_LIMIT = 10;

export type ChatChunkSearchMode = "semantic" | "exact" | "both";

export interface ChatChunkHit {
  noteId: string;
  title: string;
  chunkId: string;
  text: string;
  source: string;
}

interface SearchChatChunksParams {
  userId: string;
  query: string;
  mode: ChatChunkSearchMode;
  scopedNoteIds?: string[] | null;
}

interface ChunkSearchRow {
  note_id: string;
  title: string | null;
  chunk_id: string;
  chunk_text: string;
}

interface NoteSearchRow {
  note_id: string;
  title: string | null;
  snippet: string;
}

function normalizeSnippet(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 400);
}

export async function searchChatChunks({
  userId,
  query,
  mode,
  scopedNoteIds,
}: SearchChatChunksParams): Promise<ChatChunkHit[]> {
  const scoped = !!(scopedNoteIds && scopedNoteIds.length > 0);
  const seenChunkIds = new Set<string>();
  const results: ChatChunkHit[] = [];

  const add = (
    noteId: string,
    title: string,
    chunkId: string,
    text: string,
    source: string,
  ) => {
    if (seenChunkIds.has(chunkId)) return;
    seenChunkIds.add(chunkId);
    results.push({
      noteId,
      title,
      chunkId,
      text: normalizeSnippet(text),
      source,
    });
  };

  if (mode === "semantic" || mode === "both") {
    try {
      const searchStartedAt = Date.now();
      const vec = await embedText(query);
      const hits = await searchChunkVectors({
        userId,
        vector: vec,
        documentIds: scoped ? scopedNoteIds : null,
        maxDistance: getChatMaxDistance(),
        limit: QUERY_LIMIT,
      });
      void Metrics.searchLatency("semantic", Date.now() - searchStartedAt);
      const chunks = await hydrateOwnedNoteChunks(userId, hits);

      for (const chunk of chunks) {
        add(
          chunk.noteId,
          chunk.title || "Untitled",
          chunk.chunkId,
          chunk.text,
          "semantic",
        );
      }
    } catch {
      // embedding unavailable
      void Metrics.searchLatency("semantic", 0);
    }
  }

  if (mode === "exact" || mode === "both") {
    const exactSearchStartedAt = Date.now();
    const safe = query.replace(/%/g, "\\%").replace(/_/g, "\\_");
    const pattern = `%${safe}%`;

    const chunkRows = (scoped
      ? await sql`
          SELECT n.note_id, n.title, c.id AS chunk_id, c.text AS chunk_text
          FROM app.chunks c
          JOIN app.notes n ON n.note_id = c.document_id
          WHERE c.user_id = ${userId}::uuid
            AND n.note_id = ANY(${scopedNoteIds}::uuid[])
            AND n.is_folder = false
            AND n.deleted_at IS NULL
            AND c.text ILIKE ${pattern}
          LIMIT ${QUERY_LIMIT}
        `
      : await sql`
          SELECT n.note_id, n.title, c.id AS chunk_id, c.text AS chunk_text
          FROM app.chunks c
          JOIN app.notes n ON n.note_id = c.document_id
          WHERE c.user_id = ${userId}::uuid
            AND n.is_folder = false
            AND n.deleted_at IS NULL
            AND c.text ILIKE ${pattern}
          LIMIT ${QUERY_LIMIT}
        `) as ChunkSearchRow[];

    for (const row of chunkRows) {
      add(
        row.note_id,
        row.title || "Untitled",
        row.chunk_id,
        row.chunk_text,
        "exact",
      );
    }

    const noteRows = (scoped
      ? await sql`
          WITH matches AS (
            SELECT
              note_id,
              title,
              COALESCE(NULLIF(TRIM(extracted_text), ''), NULLIF(TRIM(content), ''), '') AS search_text
            FROM app.notes
            WHERE user_id = ${userId}::uuid
              AND note_id = ANY(${scopedNoteIds}::uuid[])
              AND is_folder = false
              AND deleted_at IS NULL
          )
          SELECT
            note_id,
            title,
            SUBSTRING(
              search_text
              FROM GREATEST(POSITION(LOWER(${query}) IN LOWER(search_text)) - 80, 1)
              FOR 400
            ) AS snippet
          FROM matches
          WHERE search_text ILIKE ${pattern}
          LIMIT ${QUERY_LIMIT}
        `
      : await sql`
          WITH matches AS (
            SELECT
              note_id,
              title,
              COALESCE(NULLIF(TRIM(extracted_text), ''), NULLIF(TRIM(content), ''), '') AS search_text
            FROM app.notes
            WHERE user_id = ${userId}::uuid
              AND is_folder = false
              AND deleted_at IS NULL
          )
          SELECT
            note_id,
            title,
            SUBSTRING(
              search_text
              FROM GREATEST(POSITION(LOWER(${query}) IN LOWER(search_text)) - 80, 1)
              FOR 400
            ) AS snippet
          FROM matches
          WHERE search_text ILIKE ${pattern}
          LIMIT ${QUERY_LIMIT}
        `) as NoteSearchRow[];

    const noteIdsWithChunkHits = new Set(
      results.map((result) => result.noteId),
    );
    for (const row of noteRows) {
      if (noteIdsWithChunkHits.has(row.note_id)) continue;
      add(
        row.note_id,
        row.title || "Untitled",
        `note:${row.note_id}`,
        row.snippet,
        "exact-note",
      );
    }
    void Metrics.searchLatency("exact", Date.now() - exactSearchStartedAt);
  }

  return results.slice(0, MAX_RESULTS);
}
