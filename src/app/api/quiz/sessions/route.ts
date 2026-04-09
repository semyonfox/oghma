import { NextRequest, NextResponse, after } from "next/server";
import { validateSession } from "@/lib/auth";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import { generateUUID } from "@/lib/utils/uuid";
import {
  resolveChunkIds,
  getSessionCandidates,
  selectCards,
} from "@/lib/quiz/select";
import { generateQuestion } from "@/lib/quiz/generate";
import { getCurrentBloomLevel, pickQuestionType } from "@/lib/quiz/bloom";
import { cardFromDB, getNextIntervals } from "@/lib/quiz/fsrs";
import { normalizeQuizQuestion } from "@/lib/quiz/normalize-question";
import { SESSION_DEFAULTS } from "@/lib/quiz/types";
import type { FilterType } from "@/lib/quiz/types";
import sql from "@/database/pgsql.js";
import {
  quizSessionCreateSchema,
  validateBody,
} from "@/lib/validations/schemas";

// generation limits — all generation is background-only (never blocks the response)
const AI_GENERATION_PER_MODULE = 5;   // max questions generated per module per trigger
const AI_GENERATION_BATCH_SIZE = 25;  // upper bound for total background pass
const BACKGROUND_PARALLEL = 5;       // how many LLM calls run in parallel within after()

export const POST = withErrorHandler(async (request: NextRequest) => {
  const user = await validateSession();
  if (!user) return tracedError("Unauthorized", 401);

  const rawBody = await request.json();

  // validate input shape
  const zodResult = validateBody(quizSessionCreateSchema, rawBody);
  if (!zodResult.success) return zodResult.response;
  const body = zodResult.data;

  const filterType = body.filterType as FilterType;
  const filterValue = body.filterValue;

  if (!filterType) return tracedError("filterType is required", 400);

  const userId = user.user_id;

  // resolve filter to chunk IDs
  const chunkIds = await resolveChunkIds(userId, filterType, filterValue);
  if (chunkIds.length === 0) {
    return tracedError(
      "No content found for this filter. Import some notes first.",
      404,
    );
  }

  // get candidates
  const { dueCards, uncoveredChunkIds, masteredCards } =
    await getSessionCandidates(userId, chunkIds);

  // select cards for this session
  const maxQuestions = body.maxQuestions || SESSION_DEFAULTS.maxQuestions;
  const selection = selectCards(
    dueCards,
    uncoveredChunkIds,
    maxQuestions,
    masteredCards,
  );

  // schedule background generation for uncovered chunks — never blocks the response
  if (uncoveredChunkIds.length > 0) {
    const uncoveredChunkMeta = await sql`
          SELECT c.id, COALESCE(n.canvas_module_id, -1) AS module_id
          FROM app.chunks c
          JOIN app.notes n ON c.document_id = n.note_id
          WHERE c.id = ANY(${uncoveredChunkIds}::uuid[])
          ORDER BY random()
      `;

    const bgChunkIds: string[] = [];
    const moduleCounts = new Map<number, number>();
    for (const row of uncoveredChunkMeta as Array<{ id: string; module_id: number }>) {
      const moduleId = Number(row.module_id);
      const used = moduleCounts.get(moduleId) ?? 0;
      if (used >= AI_GENERATION_PER_MODULE) continue;
      bgChunkIds.push(row.id);
      moduleCounts.set(moduleId, used + 1);
      if (bgChunkIds.length >= AI_GENERATION_BATCH_SIZE) break;
    }

    if (bgChunkIds.length > 0) {
      after(async () => {
        // first batch runs in parallel for faster initial coverage
        const parallel = bgChunkIds.slice(0, BACKGROUND_PARALLEL);
        const sequential = bgChunkIds.slice(BACKGROUND_PARALLEL);

        await Promise.allSettled(
          parallel.map(async (chunkId) => {
            try {
              const [chunk] = await sql`
                      SELECT c.id, c.text, c.document_id, n.title, n.canvas_course_id
                      FROM app.chunks c
                      JOIN app.notes n ON c.document_id = n.note_id
                      WHERE c.id = ${chunkId}::uuid
                  `;
              if (!chunk) return;
              const reviews = await sql`
                      SELECT qq.bloom_level, qr.was_correct
                      FROM app.quiz_reviews qr
                      JOIN app.quiz_questions qq ON qr.question_id = qq.id
                      WHERE qq.chunk_id = ${chunkId}::uuid AND qr.user_id = ${userId}::uuid
                      ORDER BY qr.created_at ASC
                  `;
              const bloomLevel = getCurrentBloomLevel(reviews);
              const questionType = pickQuestionType(bloomLevel);
              await generateQuestion(
                userId,
                chunk.document_id,
                chunkId,
                chunk.text,
                chunk.title || "Unknown Module",
                bloomLevel,
                questionType,
              );
            } catch {
              // don't crash the background task
            }
          }),
        );

        for (const chunkId of sequential) {
          try {
            const [chunk] = await sql`
                    SELECT c.id, c.text, c.document_id, n.title, n.canvas_course_id
                    FROM app.chunks c
                    JOIN app.notes n ON c.document_id = n.note_id
                    WHERE c.id = ${chunkId}::uuid
                `;
            if (!chunk) continue;
            const reviews = await sql`
                    SELECT qq.bloom_level, qr.was_correct
                    FROM app.quiz_reviews qr
                    JOIN app.quiz_questions qq ON qr.question_id = qq.id
                    WHERE qq.chunk_id = ${chunkId}::uuid AND qr.user_id = ${userId}::uuid
                    ORDER BY qr.created_at ASC
                `;
            const bloomLevel = getCurrentBloomLevel(reviews);
            const questionType = pickQuestionType(bloomLevel);
            await generateQuestion(
              userId,
              chunk.document_id,
              chunkId,
              chunk.text,
              chunk.title || "Unknown Module",
              bloomLevel,
              questionType,
            );
          } catch {
            // don't crash the background task
          }
        }
      });
    }
  }

  // collect existing card IDs only — no blocking LLM calls in the response path
  const allCardIds = [
    ...new Set([
      ...selection.due.map((c) => c.id),
      ...selection.retention.map((c) => c.id),
    ]),
  ].slice(0, maxQuestions);

  if (allCardIds.length === 0) {
    // no existing cards yet — generation kicked off in background, tell client to retry
    if (uncoveredChunkIds.length > 0) {
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

  // create session (persist card_ids so GET can reconstruct the session)
  const sessionId = generateUUID();
  await sql`
        INSERT INTO app.quiz_sessions (id, user_id, filter_type, filter_value, total_questions, card_ids)
        VALUES (
            ${sessionId}::uuid,
            ${userId}::uuid,
            ${filterType},
            ${filterValue ? JSON.stringify(filterValue) : null}::jsonb,
            ${allCardIds.length},
            to_jsonb(${allCardIds}::uuid[])
        )
    `;

  // get first question
  let firstQuestion: any = null;
  if (allCardIds.length > 0) {
    const rows = await sql`
            SELECT qc.id as card_id, qq.*, qc.state, qc.stability, qc.difficulty,
                   qc.elapsed_days, qc.scheduled_days, qc.reps, qc.lapses, qc.due, qc.last_review
            FROM app.quiz_cards qc
            JOIN app.quiz_questions qq ON qc.question_id = qq.id
            WHERE qc.id = ${allCardIds[0]}::uuid
        `;
    firstQuestion = normalizeQuizQuestion(rows[0] ?? null);
    if (firstQuestion) {
      const fsrsCard = cardFromDB(firstQuestion);
      firstQuestion.intervals = getNextIntervals(fsrsCard);
    }
  }

  return NextResponse.json(
    {
      sessionId,
      totalQuestions: allCardIds.length,
      cardIds: allCardIds,
      currentIndex: 0,
      question: firstQuestion,
    },
    { status: 201 },
  );
});
