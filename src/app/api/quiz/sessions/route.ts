import { NextRequest, NextResponse } from "next/server";
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
import { SESSION_DEFAULTS } from "@/lib/quiz/types";
import type { FilterType } from "@/lib/quiz/types";
import sql from "@/database/pgsql.js";
import {
  quizSessionCreateSchema,
  validateBody,
} from "@/lib/validations/schemas";

const AI_GENERATION_BATCH_SIZE = 5;

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

  // generate questions for uncovered chunks (on-demand)
  // always try to generate a small batch so sessions organically fill until all chunks are covered
  const generatedQuestionIds: string[] = [];
  const generationChunkIds = uncoveredChunkIds.slice(
    0,
    AI_GENERATION_BATCH_SIZE,
  );
  for (const chunkId of generationChunkIds) {
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

    const question = await generateQuestion(
      userId,
      chunk.document_id,
      chunkId,
      chunk.text,
      chunk.title || "Unknown Module",
      bloomLevel,
      questionType,
    );
    if (question) generatedQuestionIds.push(question.id);
  }

  // collect all card IDs for this session
  const prioritizedCardIds = [
    ...selection.due.map((c) => c.id),
    ...selection.retention.map((c) => c.id),
  ];

  if (generatedQuestionIds.length > 0) {
    const newCards = await sql`
            SELECT id FROM app.quiz_cards
            WHERE question_id = ANY(${generatedQuestionIds}::uuid[])
        `;
    prioritizedCardIds.unshift(...newCards.map((c: any) => c.id));
  }

  const allCardIds = [...new Set(prioritizedCardIds)].slice(0, maxQuestions);

  if (allCardIds.length === 0) {
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
    firstQuestion = rows[0] ?? null;
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
