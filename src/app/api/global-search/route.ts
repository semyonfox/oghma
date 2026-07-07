import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import { embedText } from "@/lib/embedText";
import logger from "@/lib/logger";
import { searchChunkVectors } from "@/lib/qdrant";
import sql from "@/database/pgsql.js";

type SearchSource = "keyword" | "semantic" | "recent";

interface GlobalSearchResult {
  id: string;
  type: "note" | "chat" | "quiz";
  title: string;
  subtitle?: string;
  snippet?: string;
  href: string;
  source: SearchSource;
}

const LIKE_ESCAPE = "\\";

function cleanSnippet(value: string | null | undefined): string {
  return (value || "")
    .replace(/[#*_~`>\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

async function recentNotes(
  userId: string,
  limit = 5,
): Promise<GlobalSearchResult[]> {
  const rows = await sql`
    SELECT note_id, title, content, updated_at
    FROM app.notes
    WHERE user_id = ${userId}::uuid
      AND deleted_at IS NULL
      AND COALESCE(is_folder, false) = false
    ORDER BY updated_at DESC
    LIMIT ${limit}
  `;

  return rows.map((row: any) => ({
    id: row.note_id,
    type: "note" as const,
    title: row.title || "Untitled",
    subtitle: "Recently edited note",
    snippet: cleanSnippet(row.content).slice(0, 220),
    href: `/notes/${row.note_id}`,
    source: "recent" as const,
  }));
}

async function keywordNotes(
  userId: string,
  query: string,
  limit = 6,
): Promise<GlobalSearchResult[]> {
  const pattern = likePattern(query);
  const rows = await sql`
    SELECT note_id, title,
           CASE WHEN content IS NOT NULL THEN LEFT(content, 220) ELSE '' END AS snippet
    FROM app.notes
    WHERE user_id = ${userId}::uuid
      AND deleted_at IS NULL
      AND COALESCE(is_folder, false) = false
      AND (
        title ILIKE ${pattern} ESCAPE ${LIKE_ESCAPE}
        OR content ILIKE ${pattern} ESCAPE ${LIKE_ESCAPE}
      )
    ORDER BY
      CASE WHEN title ILIKE ${pattern} ESCAPE ${LIKE_ESCAPE} THEN 0 ELSE 1 END,
      updated_at DESC
    LIMIT ${limit}
  `;

  return rows.map((row: any) => ({
    id: row.note_id,
    type: "note" as const,
    title: row.title || "Untitled",
    subtitle: "Note",
    snippet: cleanSnippet(row.snippet).slice(0, 220),
    href: `/notes/${row.note_id}`,
    source: "keyword" as const,
  }));
}

async function semanticNotes(
  userId: string,
  query: string,
  excludeNoteIds: string[],
  limit = 6,
): Promise<GlobalSearchResult[]> {
  try {
    const vector = await embedText(query);
    const hits = await searchChunkVectors({
      userId,
      vector,
      excludeDocumentIds: excludeNoteIds,
      limit: Math.max(limit * 3, limit),
      maxDistance: 0.82,
    });

    if (hits.length === 0) return [];

    const chunkIds = hits.map((hit) => hit.chunkId);
    const rows = await sql`
      SELECT n.note_id, n.title, c.id AS chunk_id, c.text AS snippet
      FROM app.chunks c
      JOIN app.notes n ON n.note_id = c.document_id
      WHERE c.user_id = ${userId}::uuid
        AND c.id = ANY(${chunkIds}::uuid[])
        AND n.deleted_at IS NULL
        AND COALESCE(n.is_folder, false) = false
    `;
    const byChunkId = new Map<string, any>(
      rows.map((row: any) => [row.chunk_id, row]),
    );
    const seen = new Set<string>();

    return hits
      .flatMap((hit) => {
        const row = byChunkId.get(hit.chunkId);
        if (!row || seen.has(row.note_id)) return [];
        seen.add(row.note_id);
        return [
          {
            id: row.note_id,
            type: "note" as const,
            title: row.title || "Untitled",
            subtitle: "Semantic note match",
            snippet: cleanSnippet(row.snippet).slice(0, 220),
            href: `/notes/${row.note_id}`,
            source: "semantic" as const,
          },
        ];
      })
      .slice(0, limit);
  } catch (error) {
    logger.warn("global semantic note search failed", { error });
    return [];
  }
}

async function searchNotes(
  userId: string,
  query: string | null,
): Promise<GlobalSearchResult[]> {
  if (!query) return recentNotes(userId);

  const keyword = await keywordNotes(userId, query);
  const semantic = await semanticNotes(
    userId,
    query,
    keyword.map((result) => result.id),
  );

  const seen = new Set<string>();
  return [...keyword, ...semantic].filter((result) => {
    if (seen.has(result.id)) return false;
    seen.add(result.id);
    return true;
  });
}

async function searchChats(
  userId: string,
  query: string | null,
  limit = 5,
): Promise<GlobalSearchResult[]> {
  if (!query) {
    const rows = await sql`
      SELECT s.id, s.title, s.updated_at, COUNT(m.id)::int AS message_count
      FROM app.chat_sessions s
      LEFT JOIN app.chat_messages m ON m.session_id = s.id
      WHERE s.user_id = ${userId}::uuid
      GROUP BY s.id
      ORDER BY s.updated_at DESC
      LIMIT ${limit}
    `;

    return rows.map((row: any) => ({
      id: row.id,
      type: "chat" as const,
      title: row.title || "New Chat",
      subtitle: `${row.message_count || 0} messages`,
      href: `/chat/${row.id}`,
      source: "recent" as const,
    }));
  }

  const pattern = likePattern(query);
  const rows = await sql`
    SELECT s.id, s.title, s.updated_at, COUNT(m.id)::int AS message_count,
           COALESCE(
             MAX(CASE
               WHEN m.content ILIKE ${pattern} ESCAPE ${LIKE_ESCAPE}
               THEN LEFT(m.content, 220)
               ELSE NULL
             END),
             ''
           ) AS snippet
    FROM app.chat_sessions s
    LEFT JOIN app.chat_messages m ON m.session_id = s.id
    WHERE s.user_id = ${userId}::uuid
      AND (
        s.title ILIKE ${pattern} ESCAPE ${LIKE_ESCAPE}
        OR EXISTS (
          SELECT 1
          FROM app.chat_messages sm
          WHERE sm.session_id = s.id
            AND sm.content ILIKE ${pattern} ESCAPE ${LIKE_ESCAPE}
        )
      )
    GROUP BY s.id
    ORDER BY
      CASE WHEN s.title ILIKE ${pattern} ESCAPE ${LIKE_ESCAPE} THEN 0 ELSE 1 END,
      s.updated_at DESC
    LIMIT ${limit}
  `;

  return rows.map((row: any) => ({
    id: row.id,
    type: "chat" as const,
    title: row.title || "New Chat",
    subtitle: `${row.message_count || 0} messages`,
    snippet: cleanSnippet(row.snippet).slice(0, 220),
    href: `/chat/${row.id}`,
    source: "keyword" as const,
  }));
}

async function searchQuizzes(
  userId: string,
  query: string | null,
  limit = 5,
): Promise<GlobalSearchResult[]> {
  const filter = query
    ? sql`WHERE course_name ILIKE ${likePattern(query)} ESCAPE ${LIKE_ESCAPE}`
    : sql``;

  const rows = await sql`
    WITH course_stats AS (
      SELECT
        n.canvas_course_id,
        COALESCE(
          (SELECT f.title FROM app.notes f
           WHERE f.user_id = ${userId}::uuid
             AND f.canvas_course_id = n.canvas_course_id
             AND f.is_folder = true
             AND f.canvas_module_id IS NULL
             AND f.canvas_assignment_id IS NULL
             AND f.deleted_at IS NULL
           ORDER BY f.created_at ASC
           LIMIT 1),
          MAX(n.title)
        ) AS course_name,
        COUNT(DISTINCT qc.id)::int AS total_cards,
        COUNT(DISTINCT qc.id) FILTER (WHERE qc.due <= now())::int AS due_count,
        COUNT(DISTINCT qc.id) FILTER (WHERE qc.state = 'review' AND qc.stability > 7)::int AS mastered_count
      FROM app.notes n
      LEFT JOIN app.quiz_questions qq ON qq.note_id = n.note_id AND qq.user_id = ${userId}::uuid
      LEFT JOIN app.quiz_cards qc ON qc.question_id = qq.id AND qc.user_id = ${userId}::uuid
      LEFT JOIN app.user_course_settings ucs
        ON ucs.user_id = ${userId}::uuid
        AND ucs.canvas_course_id = n.canvas_course_id
      WHERE n.user_id = ${userId}::uuid
        AND n.canvas_course_id IS NOT NULL
        AND n.deleted_at IS NULL
        AND (ucs.is_active IS NULL OR ucs.is_active = true)
        AND EXISTS (
          SELECT 1 FROM app.chunks c
          WHERE c.document_id = n.note_id AND c.user_id = ${userId}::uuid
        )
      GROUP BY n.canvas_course_id
    )
    SELECT *
    FROM course_stats
    ${filter}
    ORDER BY due_count DESC, total_cards DESC, course_name ASC
    LIMIT ${limit}
  `;

  const keywordResults: GlobalSearchResult[] = rows.map((row: any) =>
    formatQuizResult(row, query ? "keyword" : "recent"),
  );

  if (!query) return keywordResults;

  const semanticResults = await semanticQuizzes(
    userId,
    query,
    keywordResults.map((result) => result.id),
    limit,
  );

  return [...keywordResults, ...semanticResults].slice(0, limit);
}

function formatQuizResult(
  row: any,
  source: SearchSource,
): GlobalSearchResult {
  const totalCards = Number(row.total_cards || 0);
  const dueCount = Number(row.due_count || 0);
  const mastery =
    totalCards > 0
      ? Math.round((Number(row.mastered_count || 0) / totalCards) * 100)
      : 0;

  return {
    id: String(row.canvas_course_id),
    type: "quiz" as const,
    title: row.course_name || "Course quiz",
    subtitle: `${dueCount} due - ${totalCards} cards - ${mastery}% mastery`,
    href: "/quiz",
    source,
  };
}

async function semanticQuizzes(
  userId: string,
  query: string,
  excludeCourseIds: string[],
  limit: number,
): Promise<GlobalSearchResult[]> {
  try {
    const vector = await embedText(query);
    const hits = await searchChunkVectors({
      userId,
      vector,
      limit: Math.max(limit * 4, limit),
      maxDistance: 0.82,
    });

    if (hits.length === 0) return [];

    const chunkIds = hits.map((hit) => hit.chunkId);
    const rows = await sql`
      WITH hit_courses AS (
        SELECT DISTINCT n.canvas_course_id
        FROM app.chunks c
        JOIN app.notes n ON n.note_id = c.document_id
        WHERE c.user_id = ${userId}::uuid
          AND c.id = ANY(${chunkIds}::uuid[])
          AND n.canvas_course_id IS NOT NULL
          AND n.deleted_at IS NULL
      ),
      course_stats AS (
        SELECT
          n.canvas_course_id,
          COALESCE(
            (SELECT f.title FROM app.notes f
             WHERE f.user_id = ${userId}::uuid
               AND f.canvas_course_id = n.canvas_course_id
               AND f.is_folder = true
               AND f.canvas_module_id IS NULL
               AND f.canvas_assignment_id IS NULL
               AND f.deleted_at IS NULL
             ORDER BY f.created_at ASC
             LIMIT 1),
            MAX(n.title)
          ) AS course_name,
          COUNT(DISTINCT qc.id)::int AS total_cards,
          COUNT(DISTINCT qc.id) FILTER (WHERE qc.due <= now())::int AS due_count,
          COUNT(DISTINCT qc.id) FILTER (WHERE qc.state = 'review' AND qc.stability > 7)::int AS mastered_count
        FROM app.notes n
        JOIN hit_courses hc ON hc.canvas_course_id = n.canvas_course_id
        LEFT JOIN app.quiz_questions qq ON qq.note_id = n.note_id AND qq.user_id = ${userId}::uuid
        LEFT JOIN app.quiz_cards qc ON qc.question_id = qq.id AND qc.user_id = ${userId}::uuid
        LEFT JOIN app.user_course_settings ucs
          ON ucs.user_id = ${userId}::uuid
          AND ucs.canvas_course_id = n.canvas_course_id
        WHERE n.user_id = ${userId}::uuid
          AND n.deleted_at IS NULL
          AND (ucs.is_active IS NULL OR ucs.is_active = true)
        GROUP BY n.canvas_course_id
      )
      SELECT *
      FROM course_stats
      ORDER BY due_count DESC, total_cards DESC, course_name ASC
      LIMIT ${limit}
    `;

    const excluded = new Set(excludeCourseIds);
    return rows
      .map((row: any) => formatQuizResult(row, "semantic"))
      .filter((result: GlobalSearchResult) => !excluded.has(result.id))
      .slice(0, limit);
  } catch (error) {
    logger.warn("global semantic quiz search failed", { error });
    return [];
  }
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const user = await validateSession();
  if (!user) return tracedError("Unauthorized", 401);

  const url = new URL(request.url);
  const rawQuery = url.searchParams.get("q")?.trim() ?? "";
  const query = rawQuery.length >= 2 ? rawQuery.slice(0, 200) : null;
  const userId = user.user_id;

  if (rawQuery.length > 0 && !query) {
    return NextResponse.json({
      query: rawQuery,
      results: {
        notes: [],
        chats: [],
        quizzes: [],
      },
    });
  }

  const [notes, chats, quizzes] = await Promise.all([
    searchNotes(userId, query),
    searchChats(userId, query),
    searchQuizzes(userId, query),
  ]);

  return NextResponse.json({
    query: rawQuery,
    results: {
      notes,
      chats,
      quizzes,
    },
  });
});
