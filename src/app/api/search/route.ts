import { NextRequest, NextResponse } from "next/server";
import sql from "@/database/pgsql";
import { embedText } from "@/lib/rag/embeddings";
import logger from "@/lib/logger";
import { requireAuth, tracedError, withErrorHandler } from "@/lib/api-error";
import { searchChunkVectors, type ChunkVectorHit } from "@/lib/qdrant";
import { canvasIdForBigintColumn } from "@/lib/canvas/id";
import { hydrateOwnedNoteChunks } from "@/lib/rag/owned-note-chunks";
import { checkRateLimit } from "@/lib/rate-limiter";
import { isValidUUID } from "@/lib/utils/uuid";

// the client sends ids it already shows. anything past this is ignored rather
// than turned into an unbounded Qdrant filter
const MAX_EXCLUDE_IDS = 100;
const COURSE_NOTE_PAGE_SIZE = 500;

interface ResultItem {
  note_id: string;
  title: string;
  snippet: string;
  source: "keyword" | "semantic";
  distance?: number;
}

interface KeywordNoteRow {
  note_id: string;
  title: string | null;
  snippet: string | null;
}

// keyword search via PG ILIKE on notes title + content
async function keywordSearch(
  userId: string,
  query: string,
  course?: string,
  limit = 20,
): Promise<ResultItem[]> {
  const pattern = `%${query.replace(/[\\%_]/g, (value) => `\\${value}`)}%`;
  const rows = await sql<KeywordNoteRow[]>`
        SELECT note_id, title,
               CASE
                   WHEN content IS NOT NULL THEN LEFT(content, 200)
                   ELSE ''
               END AS snippet
        FROM app.notes
        WHERE user_id = ${userId}::uuid
          AND deleted_at IS NULL
          AND (title ILIKE ${pattern} OR content ILIKE ${pattern})
          ${course ? sql`AND canvas_course_id = ${course}::bigint` : sql``}
        ORDER BY
            CASE WHEN title ILIKE ${pattern} THEN 0 ELSE 1 END,
            updated_at DESC
        LIMIT ${limit}
    `;
  return rows.map((r) => ({
    note_id: r.note_id,
    title: r.title || "Untitled",
    snippet: (r.snippet || "").replace(/[#*_~`>\[\]]/g, "").trim(),
    source: "keyword" as const,
  }));
}

// semantic search via configured embedding provider + Qdrant cosine search
// excludeIds: note_ids already found by keyword — skip them in the query
async function semanticSearch(
  userId: string,
  query: string,
  excludeIds: string[] = [],
  course?: string,
  limit = 10,
): Promise<ResultItem[]> {
  const vector = await embedText(query);
  const candidateLimit = limit * 3;
  let hits: ChunkVectorHit[] = [];
  if (course) {
    // Scope before top-K retrieval. Page IDs to bound each vector filter and
    // merge each page's top-K; this preserves recall without a payload backfill.
    let after: string | null = null;
    while (true) {
      const notes: { note_id: string }[] = await sql<{ note_id: string }[]>`
        SELECT note_id FROM app.notes
        WHERE user_id = ${userId}::uuid AND canvas_course_id = ${course}::bigint
          AND deleted_at IS NULL AND COALESCE(is_folder, false) = false
          AND (${after}::uuid IS NULL OR note_id > ${after}::uuid)
        ORDER BY note_id LIMIT ${COURSE_NOTE_PAGE_SIZE}
      `;
      if (!notes.length) break;
      const pageHits = await searchChunkVectors({
        userId,
        vector,
        excludeDocumentIds: excludeIds,
        documentIds: notes.map((note) => note.note_id),
        limit: candidateLimit,
      });
      hits = [...hits, ...pageHits]
        .sort((a, b) => a.distance - b.distance)
        .slice(0, candidateLimit);
      if (notes.length < COURSE_NOTE_PAGE_SIZE) break;
      after = notes[notes.length - 1].note_id;
    }
  } else {
    hits = await searchChunkVectors({
      userId,
      vector,
      excludeDocumentIds: excludeIds,
      limit: candidateLimit,
    });
  }
  if (hits.length === 0) return [];

  const chunks = await hydrateOwnedNoteChunks(userId, hits, {
    uniqueNotes: true,
  });
  return chunks
    .filter((chunk) => !course || chunk.canvasCourseId === course)
    .slice(0, limit)
    .map((chunk) => ({
      note_id: chunk.noteId,
      title: chunk.title || "Untitled",
      snippet: chunk.text.slice(0, 200).trim(),
      distance: chunk.hit.distance,
      source: "semantic" as const,
    }));
}

// GET /api/search?q=query&mode=keyword|semantic&exclude=id1,id2
export const GET = withErrorHandler(async (request: NextRequest) => {
  const user = await requireAuth();

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim().slice(0, 200);
  const mode = url.searchParams.get("mode") || "keyword";
  const rawCourse = url.searchParams.get("course") || undefined;

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  let course: string | undefined;
  if (rawCourse) {
    try {
      course = canvasIdForBigintColumn(rawCourse, "Canvas course ID");
    } catch {
      return tracedError("Invalid course ID", 400);
    }
  }

  const userId = user.user_id;

  if (mode === "keyword") {
    const results = await keywordSearch(userId, query, course);
    return NextResponse.json({ results });
  }

  if (mode === "semantic") {
    // each semantic query is a paid embedding call. agents drive this route,
    // so it gets its own budget instead of eating the search palette's
    const limited = await checkRateLimit("semantic-search", userId);
    if (limited) return limited;

    // exclude note_ids the client already has from keyword/local results
    const excludeIds = (url.searchParams.get("exclude") || "")
      .split(",")
      .map((id) => id.trim())
      .filter(isValidUUID)
      .slice(0, MAX_EXCLUDE_IDS);

    try {
      const results = await semanticSearch(userId, query, excludeIds, course);
      return NextResponse.json({ results });
    } catch (err) {
      logger.error("semantic search failed", err);
      return NextResponse.json({ results: [] });
    }
  }

  return tracedError("Invalid mode", 400);
});
