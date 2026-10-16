import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler, requireAuth } from "@/lib/api-error";
import { embedText } from "@/lib/rag/embeddings";
import logger from "@/lib/logger";
import { searchChunkVectors } from "@/lib/qdrant";
import { checkRateLimit } from "@/lib/rate-limiter";
import { hydrateOwnedNoteChunks } from "@/lib/rag/owned-note-chunks";
import { searchStudyMaterials } from "@/lib/study-map/search";
import sql from "@/database/pgsql";

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

interface RecentNoteRow {
  note_id: string;
  title: string | null;
  content: string | null;
}

interface KeywordNoteRow {
  note_id: string;
  title: string | null;
  snippet: string | null;
}

interface ChatSearchRow {
  id: string;
  title: string | null;
  message_count: number;
  snippet?: string | null;
}

interface QuizCourseRow {
  canvas_course_id: string | number;
  course_name: string | null;
  total_cards: number;
  due_count: number;
  mastered_count: number;
}

const LIKE_ESCAPE = "\\";
const MAX_NOTE_RESULTS = 12;
// cosine distance above this is noise for a short typed query
const SEMANTIC_MAX_DISTANCE = 0.82;
// resolves to null when embedding is unavailable, so semantic sections drop
// out and keyword results still return
type PendingQueryVector = Promise<number[] | null>;

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
  const rows = await sql<RecentNoteRow[]>`
    SELECT note_id, title, LEFT(content, 440) AS content, updated_at
    FROM app.notes
    WHERE user_id = ${userId}::uuid
      AND deleted_at IS NULL
      AND COALESCE(is_folder, false) = false
    ORDER BY updated_at DESC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
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
  const rows = await sql<KeywordNoteRow[]>`
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

  return rows.map((row) => ({
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
  semanticVector: PendingQueryVector,
  excludeNoteIds: string[],
  limit = 6,
): Promise<GlobalSearchResult[]> {
  const vector = await semanticVector;
  if (!vector) return [];

  try {
    const hits = await searchChunkVectors({
      userId,
      vector,
      excludeDocumentIds: excludeNoteIds,
      limit: limit * 3,
      maxDistance: SEMANTIC_MAX_DISTANCE,
    });

    if (hits.length === 0) return [];

    const chunks = await hydrateOwnedNoteChunks(userId, hits, {
      uniqueNotes: true,
    });
    return chunks.slice(0, limit).map((chunk) => ({
      id: chunk.noteId,
      type: "note" as const,
      title: chunk.title || "Untitled",
      subtitle: "Semantic note match",
      snippet: cleanSnippet(chunk.text).slice(0, 220),
      href: `/notes/${chunk.noteId}`,
      source: "semantic" as const,
    }));
  } catch (error) {
    logger.warn("global semantic note search failed", { error });
    return [];
  }
}

async function searchNotes(
  userId: string,
  query: string | null,
  semanticVector: PendingQueryVector,
): Promise<GlobalSearchResult[]> {
  if (!query) return recentNotes(userId);

  const keyword = await keywordNotes(userId, query);
  const semantic = await semanticNotes(
    userId,
    semanticVector,
    keyword.map((result) => result.id),
  );

  const seen = new Set<string>();
  return [...keyword, ...semantic].filter((result) => {
    if (seen.has(result.id)) return false;
    seen.add(result.id);
    return true;
  });
}

async function studyNotes(
  userId: string,
  query: string | null,
): Promise<GlobalSearchResult[]> {
  if (!query) return [];

  try {
    const materials = await searchStudyMaterials(userId, { q: query, limit: 10 });
    return materials.results.map((material) => ({
      id: material.noteId,
      type: "note" as const,
      title: material.title,
      subtitle: [
        material.mapName,
        ...material.topics.slice(0, 3).map((topic) => `${topic.status} ${topic.name}`),
      ].join(" · "),
      snippet: cleanSnippet(material.labels.join(", ")).slice(0, 220),
      href: `/notes/${material.noteId}`,
      source: "keyword" as const,
    }));
  } catch (error) {
    logger.warn("global study material search failed", { error });
    return [];
  }
}

function mergeStudyNotes(
  notes: GlobalSearchResult[],
  study: GlobalSearchResult[],
): GlobalSearchResult[] {
  const metadata = new Map<string, GlobalSearchResult>();
  for (const result of study) {
    if (!metadata.has(result.id)) metadata.set(result.id, result);
  }
  const notesById = new Map(notes.map((note) => [note.id, note]));
  const ordered = [
    ...notes.filter((note) => note.source === "keyword"),
    ...[...metadata.values()].map((material) => notesById.get(material.id) ?? material),
    ...notes.filter((note) => note.source !== "keyword"),
  ];
  const seen = new Set<string>();
  const merged = ordered.filter((note) => {
    if (seen.has(note.id)) return false;
    seen.add(note.id);
    return true;
  }).map((note) => {
    const material = metadata.get(note.id);
    return material ? { ...note, subtitle: material.subtitle, snippet: material.snippet || note.snippet } : note;
  });
  return merged.slice(0, MAX_NOTE_RESULTS);
}

async function searchChats(
  userId: string,
  query: string | null,
  limit = 5,
): Promise<GlobalSearchResult[]> {
  if (!query) {
    const rows = await sql<ChatSearchRow[]>`
      SELECT s.id, s.title, s.updated_at, COUNT(m.id)::int AS message_count
      FROM app.chat_sessions s
      LEFT JOIN app.chat_messages m ON m.session_id = s.id
      WHERE s.user_id = ${userId}::uuid
      GROUP BY s.id
      ORDER BY s.updated_at DESC
      LIMIT ${limit}
    `;

    return rows.map((row) => ({
      id: row.id,
      type: "chat" as const,
      title: row.title || "New Chat",
      subtitle: `${row.message_count || 0} messages`,
      href: `/chat/${row.id}`,
      source: "recent" as const,
    }));
  }

  const pattern = likePattern(query);
  const rows = await sql<ChatSearchRow[]>`
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

  return rows.map((row) => ({
    id: row.id,
    type: "chat" as const,
    title: row.title || "New Chat",
    subtitle: `${row.message_count || 0} messages`,
    snippet: cleanSnippet(row.snippet).slice(0, 220),
    href: `/chat/${row.id}`,
    source: "keyword" as const,
  }));
}

interface QuizCourseScope {
  nameQuery?: string;
  courseIds?: string[];
}

// one definition of a course's quiz stats, shared by the name match and the
// semantic match so both report the same numbers for the same course
async function quizCourseRows(
  userId: string,
  { nameQuery, courseIds }: QuizCourseScope,
  limit: number,
): Promise<QuizCourseRow[]> {
  const courseScope = courseIds
    ? sql`AND n.canvas_course_id = ANY(${courseIds}::bigint[])`
    : sql``;
  const nameFilter = nameQuery
    ? sql`WHERE course_name ILIKE ${likePattern(nameQuery)} ESCAPE ${LIKE_ESCAPE}`
    : sql``;

  return sql<QuizCourseRow[]>`
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
        ${courseScope}
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
    ${nameFilter}
    ORDER BY due_count DESC, total_cards DESC, course_name ASC
    LIMIT ${limit}
  `;
}

async function searchQuizzes(
  userId: string,
  query: string | null,
  semanticVector: PendingQueryVector,
  limit = 5,
): Promise<GlobalSearchResult[]> {
  const rows = await quizCourseRows(userId, { nameQuery: query ?? undefined }, limit);
  const keywordResults: GlobalSearchResult[] = rows.map((row) =>
    formatQuizResult(row, query ? "keyword" : "recent"),
  );

  if (!query) return keywordResults;

  const semanticResults = await semanticQuizzes(
    userId,
    semanticVector,
    keywordResults.map((result) => result.id),
    limit,
  );

  return [...keywordResults, ...semanticResults].slice(0, limit);
}

function formatQuizResult(
  row: QuizCourseRow,
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
  semanticVector: PendingQueryVector,
  excludeCourseIds: string[],
  limit: number,
): Promise<GlobalSearchResult[]> {
  const vector = await semanticVector;
  if (!vector) return [];

  try {
    const hits = await searchChunkVectors({
      userId,
      vector,
      limit: limit * 4,
      maxDistance: SEMANTIC_MAX_DISTANCE,
    });

    if (hits.length === 0) return [];

    const hitCourses = await sql<{ canvas_course_id: string }[]>`
      SELECT DISTINCT n.canvas_course_id::text AS canvas_course_id
      FROM app.chunks c
      JOIN app.notes n ON n.note_id = c.document_id
      WHERE c.user_id = ${userId}::uuid
        AND n.user_id = ${userId}::uuid
        AND c.id = ANY(${hits.map((hit) => hit.chunkId)}::uuid[])
        AND n.canvas_course_id IS NOT NULL
        AND n.deleted_at IS NULL
    `;
    // drop the courses the name match already returned before the limit, so
    // they cannot crowd out new ones
    const excluded = new Set(excludeCourseIds);
    const courseIds = hitCourses
      .map((row) => row.canvas_course_id)
      .filter((id) => !excluded.has(id));
    if (courseIds.length === 0) return [];

    const rows = await quizCourseRows(userId, { courseIds }, limit);
    return rows.map((row) => formatQuizResult(row, "semantic"));
  } catch (error) {
    logger.warn("global semantic quiz search failed", { error });
    return [];
  }
}

async function embedGlobalQuery(query: string): Promise<number[] | null> {
  try {
    return await embedText(query);
  } catch (error) {
    logger.warn("global semantic embedding failed", { error });
    return null;
  }
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const user = await requireAuth();

  const userId = user.user_id;
  const url = new URL(request.url);
  const rawQuery = url.searchParams.get("q")?.trim() ?? "";
  const query = rawQuery.length >= 2 ? rawQuery.slice(0, 200) : null;

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

  const limited = await checkRateLimit("global-search", userId);
  if (limited) return limited;

  // the embedding call is the slowest step, so start it now and let the
  // keyword queries run while it is in flight
  const semanticVector: PendingQueryVector = query
    ? embedGlobalQuery(query)
    : Promise.resolve(null);
  const [notes, chats, quizzes, study] = await Promise.all([
    searchNotes(userId, query, semanticVector),
    searchChats(userId, query),
    searchQuizzes(userId, query, semanticVector),
    studyNotes(userId, query),
  ]);

  return NextResponse.json({
    query: rawQuery,
    results: {
      notes: mergeStudyNotes(notes, study),
      chats,
      quizzes,
    },
  });
});
