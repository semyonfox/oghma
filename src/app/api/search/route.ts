import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import sql from "@/database/pgsql.js";
import { embedText } from "@/lib/embedText";
import logger from "@/lib/logger";
import { withErrorHandler, tracedError } from "@/lib/api-error";

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
          AND deleted = 0
          AND (title ILIKE ${pattern} OR content ILIKE ${pattern})
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

// semantic search via Cohere embed + pgvector cosine distance
// excludeIds: note_ids already found by keyword — skip them in the query
async function semanticSearch(
  userId: string,
  query: string,
  excludeIds: string[] = [],
  limit = 10,
): Promise<ResultItem[]> {
  const vector = await embedText(query);
  const vectorStr = `[${vector.join(",")}]`;
  // pass an empty array when no excludes — the != ALL clause is a no-op on empty arrays
  const excluded = excludeIds.length > 0 ? excludeIds : [];

  const rows = await sql`
        SELECT DISTINCT ON (n.note_id)
               n.note_id, n.title, c.text AS snippet,
               (e.embedding <=> ${vectorStr}::vector) AS distance
        FROM app.embeddings e
        JOIN app.chunks c ON c.id = e.chunk_id
        JOIN app.notes n ON n.note_id = c.document_id
        WHERE c.user_id = ${userId}::uuid
          AND n.deleted = 0
          AND n.note_id != ALL(${excluded}::uuid[])
        ORDER BY n.note_id, e.embedding <=> ${vectorStr}::vector
    `;

  // re-sort by distance after DISTINCT ON dedup
  const sorted = (rows as any[])
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);

  return sorted.map((r: any) => ({
    note_id: r.note_id,
    title: r.title || "Untitled",
    snippet: (r.snippet || "").slice(0, 200).trim(),
    distance: r.distance,
    source: "semantic" as const,
  }));
}

// GET /api/search?q=query&mode=keyword|semantic&exclude=id1,id2
export const GET = withErrorHandler(async (request: NextRequest) => {
  const user = await validateSession();
  if (!user) return tracedError("Unauthorized", 401);

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim();
  const mode = url.searchParams.get("mode") || "keyword";

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const userId = user.user_id;

  if (mode === "keyword") {
    const results = await keywordSearch(userId, query);
    return NextResponse.json({ results });
  }

  if (mode === "semantic") {
    // exclude note_ids the client already has from keyword/local results
    const excludeParam = url.searchParams.get("exclude") || "";
    const excludeIds = excludeParam
      ? excludeParam.split(",").filter(Boolean)
      : [];

    try {
      const results = await semanticSearch(userId, query, excludeIds);
      return NextResponse.json({ results });
    } catch (err) {
      logger.error("semantic search failed", err);
      return NextResponse.json({ results: [] });
    }
  }

  return tracedError("Invalid mode", 400);
});
