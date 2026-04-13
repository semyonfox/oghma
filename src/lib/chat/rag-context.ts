// retrieval metadata: unique sources, semantic hits, available files, scope mode

import sql from "@/database/pgsql.js";
import type { SearchResult, RagResult } from "@/lib/chat/rag-pipeline";

export interface SourceRef {
  id: string;
  title: string;
}

export interface RetrievalInfo {
  scopeMode: "global" | "scoped";
  availableCount: number;
  availableFiles: SourceRef[];
  semanticHits: SourceRef[];
  usedFiles: SourceRef[];
}

export interface RagContextResult {
  uniqueSources: SourceRef[];
  semanticHits: SourceRef[];
  retrieval: RetrievalInfo;
}

function deduplicateSources(results: SearchResult[]): SourceRef[] {
  return [...new Set(results.map((r) => r.note_id))].map((id) => {
    const r = results.find((s) => s.note_id === id)!;
    return { id: r.note_id, title: r.title };
  });
}

export async function buildRetrievalInfo(
  userId: string,
  scopedNoteIds: string[] | null,
  ragResult: RagResult,
): Promise<RagContextResult> {
  const uniqueSources = deduplicateSources(ragResult.searchResults);
  const semanticHits = deduplicateSources(ragResult.semanticMatches);

  let availableFiles: SourceRef[] = [];
  let availableCount = 0;
  let scopeMode: "global" | "scoped" = "global";

  if (scopedNoteIds && scopedNoteIds.length > 0) {
    scopeMode = "scoped";
    const [scopedRows, scopedCountRows] = await Promise.all([
      sql`
        SELECT n.note_id, n.title
        FROM app.notes n
        JOIN (
          SELECT DISTINCT c.document_id
          FROM app.chunks c
          WHERE c.user_id = ${userId}::uuid
            AND c.document_id = ANY(${scopedNoteIds}::uuid[])
        ) indexed ON indexed.document_id = n.note_id
        WHERE n.user_id = ${userId}::uuid
          AND n.is_folder = false
          AND n.deleted = 0
          AND n.deleted_at IS NULL
        ORDER BY n.title ASC
        LIMIT 24
      `,
      sql`
        SELECT COUNT(DISTINCT c.document_id)::int AS total
        FROM app.chunks c
        JOIN app.notes n ON n.note_id = c.document_id
        WHERE c.user_id = ${userId}::uuid
          AND c.document_id = ANY(${scopedNoteIds}::uuid[])
          AND n.is_folder = false
          AND n.deleted = 0
          AND n.deleted_at IS NULL
      `,
    ]);
    availableFiles = (
      scopedRows as { note_id: string; title: string }[]
    ).map((r) => ({ id: r.note_id, title: r.title }));
    availableCount = Number(
      (scopedCountRows as { total: number }[])[0]?.total ?? 0,
    );
  } else {
    const indexedRows = await sql`
      SELECT COUNT(DISTINCT c.document_id)::int AS total
      FROM app.chunks c
      JOIN app.notes n ON n.note_id = c.document_id
      WHERE c.user_id = ${userId}::uuid
        AND n.is_folder = false
        AND n.deleted = 0
        AND n.deleted_at IS NULL
    `;
    availableCount = Number(
      (indexedRows as { total: number }[])[0]?.total ?? 0,
    );
  }

  return {
    uniqueSources,
    semanticHits,
    retrieval: {
      scopeMode,
      availableCount,
      availableFiles,
      semanticHits,
      usedFiles: uniqueSources,
    },
  };
}

export function buildFallbackReply(
  searchResults: SearchResult[],
  embeddingAvailable: boolean,
): string {
  if (searchResults.length > 0) {
    const noteNames = [
      ...new Set(searchResults.map((r) => `"${r.title || "Untitled"}"`)),
    ].join(", ");
    return `Found ${searchResults.length} relevant chunk(s) from: ${noteNames}. Connect an LLM (set LLM_API_URL) to get AI-generated answers.`;
  }
  if (embeddingAvailable) {
    return "No relevant notes found. Try uploading a PDF to build your knowledge base.";
  }
  return "Embedding service unavailable. Check EMBEDDING_API_URL/KEY/MODEL configuration.";
}
