import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import { generateUUID } from "@/lib/utils/uuid";
import { resolveChunkIds, selectNextQuestion } from "@/lib/quiz/select";
import { generateQuestion } from "@/lib/quiz/generate";
import { getCurrentBloomLevel, pickQuestionType } from "@/lib/quiz/bloom";
import { cardFromDB, getNextIntervals } from "@/lib/quiz/fsrs";
import type { FilterType } from "@/lib/quiz/types";
import sql from "@/database/pgsql.js";
import {
  quizSessionCreateSchema,
  validateBody,
} from "@/lib/validations/schemas";
import { ensureQuestionBuffer } from "@/lib/quiz/generate-background";

export const POST = withErrorHandler(async (request: NextRequest) => {
  const user = await validateSession();
  if (!user) return tracedError("Unauthorized", 401);

  const rawBody = await request.json();

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

  // create session (infinite — no fixed card_ids)
  const sessionId = generateUUID();
  await sql`
    INSERT INTO app.quiz_sessions (id, user_id, filter_type, filter_value, total_questions, card_ids)
    VALUES (
      ${sessionId}::uuid,
      ${userId}::uuid,
      ${filterType},
      ${filterValue ? JSON.stringify(filterValue) : null}::jsonb,
      0,
      ${JSON.stringify(chunkIds)}::jsonb
    )
  `;

  // pick the first question
  const next = await selectNextQuestion(userId, chunkIds, []);
  let firstQuestion: any = null;

  if (next?.type === "card") {
    const rows = await sql`
      SELECT qc.id as card_id, qq.*, qc.state, qc.stability, qc.difficulty,
             qc.elapsed_days, qc.scheduled_days, qc.reps, qc.lapses, qc.due, qc.last_review
      FROM app.quiz_cards qc
      JOIN app.quiz_questions qq ON qc.question_id = qq.id
      WHERE qc.id = ${next.cardId}::uuid
    `;
    firstQuestion = rows[0] ?? null;
    if (firstQuestion) {
      const fsrsCard = cardFromDB(firstQuestion);
      firstQuestion.intervals = getNextIntervals(fsrsCard);
    }
  } else if (next?.type === "generate") {
    // generate a question on the fly for an uncovered chunk
    const [chunk] = await sql`
      SELECT c.id, c.text, c.document_id, n.title, n.canvas_course_id
      FROM app.chunks c
      JOIN app.notes n ON c.document_id = n.note_id
      WHERE c.id = ${next.chunkId}::uuid
    `;
    if (chunk) {
      const reviews = await sql`
        SELECT qq.bloom_level, qr.was_correct
        FROM app.quiz_reviews qr
        JOIN app.quiz_questions qq ON qr.question_id = qq.id
        WHERE qq.chunk_id = ${next.chunkId}::uuid AND qr.user_id = ${userId}::uuid
        ORDER BY qr.created_at ASC
      `;
      const bloomLevel = getCurrentBloomLevel(reviews);
      const questionType = pickQuestionType(bloomLevel);
      const question = await generateQuestion(
        userId,
        chunk.document_id,
        next.chunkId,
        chunk.text,
        chunk.title || "Unknown Module",
        bloomLevel,
        questionType,
        chunk.canvas_course_id,
      );
      if (question) {
        // fetch the full card+question data
        const rows = await sql`
          SELECT qc.id as card_id, qq.*, qc.state, qc.stability, qc.difficulty,
                 qc.elapsed_days, qc.scheduled_days, qc.reps, qc.lapses, qc.due, qc.last_review
          FROM app.quiz_cards qc
          JOIN app.quiz_questions qq ON qc.question_id = qq.id
          WHERE qq.id = ${question.id}::uuid
        `;
        firstQuestion = rows[0] ?? null;
        if (firstQuestion) {
          const fsrsCard = cardFromDB(firstQuestion);
          firstQuestion.intervals = getNextIntervals(fsrsCard);
        }
      }
    }
  }

  if (!firstQuestion) {
    // clean up the session we just created
    await sql`DELETE FROM app.quiz_sessions WHERE id = ${sessionId}::uuid`;
    return tracedError(
      "Could not prepare quiz questions right now. Please try again in a moment.",
      503,
    );
  }

  // fire-and-forget: ensure question buffer for upcoming questions
  ensureQuestionBuffer(userId, {
    filterChunkIds: chunkIds.slice(0, 200),
  }).catch(() => {});

  return NextResponse.json(
    {
      sessionId,
      totalQuestions: chunkIds.length,
      currentIndex: 0,
      question: firstQuestion,
    },
    { status: 201 },
  );
});
