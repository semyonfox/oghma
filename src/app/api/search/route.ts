import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import sql from "@/database/pgsql.js";
import { embedText } from "@/lib/embedText";
import logger from "@/lib/logger";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import { searchChunkVectors } from "@/lib/qdrant";

interface ResultItem {
  note_id: string;
  title: string;
  snippet: string;
  source: "keyword" | "semantic";
  distance?: number;
}

// keyword search via PG ILIKE on notes title + content
async function keywordSearch(
  userId: string,
  query: string,
  course?: string,
  limit = 20,
): Promise<ResultItem[]> {
  const pattern = `%${query}%`;
  const rows = await sql`
        SELECT note_id, title,
               CASE
                   WHEN content IS NOT NULL THEN LEFT(content, 200)
                   ELSE ''
               END AS snippet
        FROM app.notes
        WHERE user_id = ${userId}::uuid
          AND deleted_at IS NULL
          AND (title ILIKE ${pattern} OR content ILIKE ${pattern})
          ${course ? sql`AND canvas_course_id = ${course}` : sql``}
        ORDER BY
            CASE WHEN title ILIKE ${pattern} THEN 0 ELSE 1 END,
            updated_at DESC
        LIMIT ${limit}
    `;
  return rows.map((r: any) => ({
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
  const hits = await searchChunkVectors({
    userId,
    vector,
    excludeDocumentIds: excludeIds,
    limit: Math.max(limit * 3, limit),
  });
  if (hits.length === 0) return [];

  const chunkIds = hits.map((hit) => hit.chunkId);
  const rows = await sql`
    SELECT n.note_id, n.title, n.canvas_course_id, c.id AS chunk_id, c.text AS snippet
    FROM app.chunks c
    JOIN app.notes n ON n.note_id = c.document_id
    WHERE c.user_id = ${userId}::uuid
      AND c.id = ANY(${chunkIds}::uuid[])
      AND n.deleted_at IS NULL
      ${course ? sql`AND n.canvas_course_id = ${course}` : sql``}
  `;
  const byChunkId = new Map<string, any>(
    rows.map((row: any) => [row.chunk_id, row]),
  );
  const seenNotes = new Set<string>();

  return hits.flatMap((hit) => {
    const row = byChunkId.get(hit.chunkId);
    if (!row || seenNotes.has(row.note_id)) return [];
    seenNotes.add(row.note_id);
    return [{
      note_id: row.note_id,
      title: row.title || "Untitled",
      snippet: (row.snippet || "").slice(0, 200).trim(),
      distance: hit.distance,
    source: "semantic" as const,
    }];
  }).slice(0, limit);
}

// GET /api/search?q=query&mode=keyword|semantic&exclude=id1,id2
export const GET = withErrorHandler(async (request: NextRequest) => {
  const user = await validateSession();
  if (!user) return tracedError("Unauthorized", 401);

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim();
  const mode = url.searchParams.get("mode") || "keyword";
  const course = url.searchParams.get("course") || undefined;

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const userId = user.user_id;

  if (mode === "keyword") {
    const results = await keywordSearch(userId, query, course);
    return NextResponse.json({ results });
  }

  if (mode === "semantic") {
    // exclude note_ids the client already has from keyword/local results
    const excludeParam = url.searchParams.get("exclude") || "";
    const excludeIds = excludeParam
      ? excludeParam.split(",").filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim()))
      : [];

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
