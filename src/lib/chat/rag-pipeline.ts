// RAG pipeline: semantic search, scope resolution, system prompt building

import { embedText } from "@/lib/embedText";
import { rerankChunks } from "@/lib/rerank";
import { isValidUUID } from "@/lib/utils/uuid";
import { xraySubsegment } from "@/lib/xray";
import logger from "@/lib/logger";
import sql from "@/database/pgsql.js";

export interface SearchResult {
  note_id: string;
  title: string;
  chunk_text: string;
  distance: number;
}

// cosine distance threshold — chunks further than this are considered irrelevant
// Cohere multilingual-v3.0 distances: 0 = identical, ~0.3 = very similar, ~0.7 = weakly related
const MAX_DISTANCE = 0.75;

// search chunks+embeddings tables, joining back to notes for metadata
export async function semanticSearch(
  userId: string,
  queryVector: number[],
  scopedNoteIds?: string[] | null,
  limit = 8,
): Promise<SearchResult[]> {
  const vectorStr = `[${queryVector.join(",")}]`;
  const scoped = scopedNoteIds && scopedNoteIds.length > 0;
  const rows = scoped
    ? await sql`
        SELECT n.note_id, n.title, c.text AS chunk_text,
               (e.embedding <=> ${vectorStr}::vector) AS distance
        FROM app.embeddings e
        JOIN app.chunks c ON c.id = e.chunk_id
        JOIN app.notes n ON n.note_id = c.document_id
        WHERE c.user_id = ${userId}::uuid
          AND c.document_id = ANY(${scopedNoteIds}::uuid[])
          AND (e.embedding <=> ${vectorStr}::vector) < ${MAX_DISTANCE}
        ORDER BY e.embedding <=> ${vectorStr}::vector
        LIMIT ${limit}
      `
    : await sql`
        SELECT n.note_id, n.title, c.text AS chunk_text,
               (e.embedding <=> ${vectorStr}::vector) AS distance
        FROM app.embeddings e
        JOIN app.chunks c ON c.id = e.chunk_id
        JOIN app.notes n ON n.note_id = c.document_id
        WHERE c.user_id = ${userId}::uuid
          AND (e.embedding <=> ${vectorStr}::vector) < ${MAX_DISTANCE}
        ORDER BY e.embedding <=> ${vectorStr}::vector
        LIMIT ${limit}
      `;
  return rows as SearchResult[];
}

export function normalizeUuidList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const normalized = value.map((v) => String(v)).filter((v) => isValidUUID(v));
  return [...new Set(normalized)];
}

export async function resolveScopedNoteIds(
  userId: string,
  noteIds: string[],
  folderIds: string[],
): Promise<string[] | null> {
  if (noteIds.length === 0 && folderIds.length === 0) return null;

  const scoped = new Set<string>(noteIds);

  if (folderIds.length > 0) {
    const folderDescendants = await sql`
      WITH RECURSIVE subtree AS (
        SELECT ti.note_id
        FROM app.tree_items ti
        WHERE ti.user_id = ${userId}::uuid
          AND ti.note_id = ANY(${folderIds}::uuid[])
        UNION
        SELECT child.note_id
        FROM app.tree_items child
        JOIN subtree s ON child.parent_id = s.note_id
        WHERE child.user_id = ${userId}::uuid
      )
      SELECT n.note_id
      FROM app.notes n
      JOIN subtree s ON s.note_id = n.note_id
      WHERE n.user_id = ${userId}::uuid
        AND n.is_folder = false
        AND n.deleted_at IS NULL
    `;

    for (const row of folderDescendants as { note_id: string }[]) {
      scoped.add(row.note_id);
    }
  }

  return [...scoped];
}

export function buildSystemPrompt(results: SearchResult[]): string {
  if (results.length === 0) {
    return "You are a helpful study assistant. No relevant notes were found for this question, but you can still help using your general knowledge. Let the user know you didn't find matching notes, then answer as best you can. Be friendly and concise.";
  }

  // group chunks by note for cleaner context
  const byNote = new Map<string, { title: string; chunks: string[] }>();
  for (const r of results) {
    const key = r.note_id;
    if (!byNote.has(key))
      byNote.set(key, { title: r.title || "Untitled", chunks: [] });
    byNote.get(key)!.chunks.push(r.chunk_text);
  }

  const blocks = [...byNote.entries()].map(([, { title, chunks }], i) => {
    const body = chunks.join("\n").replace(/\s+/g, " ").trim();
    return `--- Note ${i + 1}: "${title}" ---\n${body}`;
  });

  return `You are a helpful study assistant with access to the user's notes.
The notes below show what the user is currently studying. Use them as helpful context — cite which note your answer draws from when relevant — but you are not limited to them. Feel free to supplement with your broader knowledge, explain concepts in more depth, or reference up-to-date information the notes may not cover.
If you go beyond the notes, briefly mention that you're drawing on general knowledge so the user knows.

NOTES CONTEXT:
${blocks.join("\n\n")}`;
}

export interface RagResult {
  searchResults: SearchResult[];
  semanticMatches: SearchResult[];
  embeddingAvailable: boolean;
  ragFailed: boolean;
}

/**
 * Run the full RAG pipeline: embed query -> semantic search -> rerank.
 * Returns search results or gracefully degrades if the pipeline fails.
 */
export async function runRagPipeline(
  userId: string,
  message: string,
  scopedNoteIds: string[] | null,
): Promise<RagResult> {
  let searchResults: SearchResult[] = [];
  let semanticMatches: SearchResult[] = [];
  let embeddingAvailable = false;
  let ragFailed = false;

  await xraySubsegment("rag-pipeline", async () => {
    const queryVector = await embedText(message);
    embeddingAvailable = true;
    // fetch 20 candidates, rerank to top 5
    const candidates = await semanticSearch(
      userId,
      queryVector,
      scopedNoteIds,
      20,
    );
    semanticMatches = candidates;
    const chunkTexts = candidates.map((r) => r.chunk_text);
    const reranked = await rerankChunks(message, chunkTexts);
    const seen = new Set<number>();
    searchResults = reranked
      .map((r) => r.index)
      .filter((index) => {
        if (index < 0 || index >= candidates.length) return false;
        if (seen.has(index)) return false;
        seen.add(index);
        return true;
      })
      .map((index) => candidates[index]);
  }).catch((err) => {
    const detail = err instanceof Error ? err.message : String(err);
    logger.warn("RAG pipeline failed, proceeding without context", {
      error: detail,
    });
    ragFailed = true;
  });

  return { searchResults, semanticMatches, embeddingAvailable, ragFailed };
}
