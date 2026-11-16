import { requireExam, examScopeNotes, loadExamPlans } from "@/lib/quiz/exams";
import { resolveTimeZone, dateKeyInTimeZone } from "@/lib/quiz/time-zone";
import { NextRequest, NextResponse, after } from "next/server";
import {
  parseJsonObject,
  requireAuth,
  withErrorHandler,
  tracedError,
} from "@/lib/api-error";
import { generateUUID } from "@/lib/utils/uuid";
import {
  resolveChunkIds,
  resolveNoteIds,
  getSessionCandidates,
  selectCards,
  sessionCardIds,
} from "@/lib/quiz/select";
import { checkRateLimit } from "@/lib/rate-limiter";
import { generateBatch } from "@/lib/quiz/generate-background";
import { loadSessionQuestion } from "@/lib/quiz/session-question";
import { QUIZ_GENERATION_MAX_FAILURES, SESSION_DEFAULTS } from "@/lib/quiz/types";
import type { QuizSessionStartResponse } from "@/lib/quiz/types";
import sql from "@/database/pgsql";
import {
  quizSessionCreateSchema,
  validateBody,
} from "@/lib/validations/schemas";

// generation limits — all generation is background-only (never blocks the response)
const AI_GENERATION_PER_MODULE = 5;  // max questions generated per module per trigger
const AI_GENERATION_BATCH_SIZE = 25; // upper bound for total background pass
// a full session still adds a few cards, so new notes keep gaining coverage
const AI_GENERATION_TOP_UP = 5;
// one pending batch per user and filter, so retries can't each pick new random chunks
const inFlightBatches = new Set<string>();

interface ChunkModuleRow {
  id: string;
  module_id: string;
}

// course admin rather than course content: outlines, welcome pages, task lists,
// submission pages and setup guides only ever produced trivia questions
const ADMIN_NOTE_TITLE =
  "(orientation|course outline|course introduction|course intro|syllabus|task list|home page|welcome to|submission link|how to install|handbook|calendar|timetable)";

/**
 * Chunks whose hardest question was answered correctly twice in a row, so the
 * next question on them should go a level deeper. Mirrors nextBloomLevel.
 */
async function chunksReadyToLevelUp(userId: string, chunkIds: string[]): Promise<string[]> {
  if (chunkIds.length === 0) return [];
  const rows = await sql<{ id: string }[]>`
    SELECT q.chunk_id AS id
    FROM app.quiz_questions q
    JOIN app.chunks c ON c.id = q.chunk_id AND c.user_id = q.user_id
    WHERE q.user_id = ${userId}::uuid
      AND q.chunk_id = ANY(${chunkIds}::uuid[])
      AND q.bloom_level < 4
      AND c.quiz_generation_failures < ${QUIZ_GENERATION_MAX_FAILURES}
      AND q.bloom_level = (
        SELECT max(x.bloom_level) FROM app.quiz_questions x
        WHERE x.user_id = q.user_id AND x.chunk_id = q.chunk_id
      )
      AND (
        SELECT count(*) = 2 AND bool_and(last.was_correct)
        FROM (
          SELECT r.was_correct FROM app.quiz_reviews r
          WHERE r.question_id = q.id AND r.user_id = q.user_id
          ORDER BY r.created_at DESC LIMIT 2
        ) last
      )
  `;
  return rows.map((row) => row.id);
}

// harder questions on mastered chunks come first, then new chunks, spread
// across modules so a single large module can't use the whole pass
async function pickChunksToGenerate(
  userId: string,
  levelUpChunkIds: string[],
  uncoveredChunkIds: string[],
  limit: number,
): Promise<string[]> {
  const rows = await sql<ChunkModuleRow[]>`
    SELECT c.id, COALESCE(n.canvas_module_id, -1)::text AS module_id
    FROM app.chunks c
    JOIN app.notes n ON c.document_id = n.note_id
    WHERE c.user_id = ${userId}::uuid
      AND c.id = ANY(${[...levelUpChunkIds, ...uncoveredChunkIds]}::uuid[])
      AND n.title !~* ${ADMIN_NOTE_TITLE}
    ORDER BY (c.id = ANY(${levelUpChunkIds}::uuid[])) DESC, random()
  `;

  const picked: string[] = [];
  const moduleCounts = new Map<string, number>();
  for (const row of rows) {
    const used = moduleCounts.get(row.module_id) ?? 0;
    if (used >= AI_GENERATION_PER_MODULE) continue;
    picked.push(row.id);
    moduleCounts.set(row.module_id, used + 1);
    if (picked.length >= limit) break;
  }
  return picked;
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  const user = await requireAuth();
  const limited = await checkRateLimit("quiz-session", user.user_id);
  if (limited) return limited;

  const zodResult = validateBody(
    quizSessionCreateSchema,
    await parseJsonObject(request),
  );
  if (!zodResult.success) return zodResult.response;
  const filter = zodResult.data;
  const filterValue = "filterValue" in filter ? filter.filterValue : null;

  const userId = user.user_id;

  const chunkIds = await resolveChunkIds(userId, filter);
  const noteIds = await resolveNoteIds(userId, filter, chunkIds);
  if (chunkIds.length === 0 && noteIds.length === 0) {
    return tracedError(
      "No content found for this filter. Import some notes first.",
      404,
    );
  }

  const now = new Date();
  const timeZone = resolveTimeZone(new URL(request.url).searchParams.get("tz"));
  const today = dateKeyInTimeZone(now, timeZone);
  const plans = await loadExamPlans(userId, timeZone, now);
  const examManagedIds = new Set(plans.flatMap((exam) => exam.futureCardIds));
  const examDueIds = new Set(
    plans.flatMap((exam) => exam.plan.days
      .filter((day) => day.date <= today)
      .flatMap((day) => day.cardIds))
      .filter((id) => examManagedIds.has(id)),
  );
  const candidates = await getSessionCandidates(
    userId, chunkIds, now, noteIds, examDueIds, examManagedIds,
  );
  const { uncoveredChunkIds } = candidates;
  // only chunks the archive rule let through can step up, so archived courses stay quiet
  const levelUpChunkIds = await chunksReadyToLevelUp(userId, candidates.activeChunkIds);

  const priorityIds = new Set<string>();
  if (filter.exam) {
    const exam = await requireExam(userId, filter.exam);
    const scope = await examScopeNotes(userId, exam);
    const rows = await sql<{ id: string }[]>`
      SELECT qc.id FROM app.quiz_cards qc
      JOIN app.quiz_questions qq ON qq.id = qc.question_id AND qq.user_id = qc.user_id
      WHERE qc.user_id = ${userId}::uuid AND qq.note_id = ANY(${scope}::uuid[])
    `;
    rows.forEach((row) => priorityIds.add(row.id));
  }
  const maxQuestions = filter.maxQuestions || SESSION_DEFAULTS.maxQuestions;
  const cardIds = sessionCardIds(selectCards(candidates, maxQuestions, priorityIds), maxQuestions);
  const needed = Math.min(
    AI_GENERATION_BATCH_SIZE,
    Math.max(AI_GENERATION_TOP_UP, maxQuestions - cardIds.length),
  );
  const batchKey = `${userId}:${JSON.stringify(filter)}`;
  const canGenerate = uncoveredChunkIds.length + levelUpChunkIds.length > 0;
  if (canGenerate && !inFlightBatches.has(batchKey)) {
    inFlightBatches.add(batchKey);
    try {
      const bgChunkIds = await pickChunksToGenerate(userId, levelUpChunkIds, uncoveredChunkIds, needed);
      if (bgChunkIds.length > 0) {
        after(async () => {
          try { await generateBatch(userId, bgChunkIds); }
          finally { inFlightBatches.delete(batchKey); }
        });
      } else {
        inFlightBatches.delete(batchKey);
      }
    } catch (error) {
      inFlightBatches.delete(batchKey);
      throw error;
    }
  }

  if (cardIds.length === 0) {
    // no cards yet — generation was kicked off above, so tell the client to retry
    if (canGenerate) {
      return NextResponse.json(
        { generating: true, retryAfter: 3 },
        { status: 202 },
      );
    }
    return tracedError(
      "Could not prepare quiz questions right now. Please try again in a moment.",
      503,
    );
  }

  // card_ids are persisted so the session can be resumed after a refresh
  const sessionId = generateUUID();
  await sql`
        INSERT INTO app.quiz_sessions (id, user_id, filter_type, filter_value, total_questions, card_ids)
        VALUES (
            ${sessionId}::uuid,
            ${userId}::uuid,
            ${filter.filterType},
            ${filterValue === null ? null : JSON.stringify(filterValue)}::text::jsonb,
            ${cardIds.length},
            to_jsonb(${cardIds}::uuid[])
        )
    `;

  const body: QuizSessionStartResponse = {
    sessionId,
    totalQuestions: cardIds.length,
    cardIds,
    currentIndex: 0,
    question: await loadSessionQuestion(userId, cardIds[0]),
  };
  return NextResponse.json(body, { status: 201 });
});
