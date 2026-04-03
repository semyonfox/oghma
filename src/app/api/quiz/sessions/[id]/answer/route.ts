import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import {
  cardFromDB,
  reviewCard,
  cardToDB,
  getNextIntervals,
} from "@/lib/quiz/fsrs";
import { generateUUID } from "@/lib/utils/uuid";
import { selectNextQuestion } from "@/lib/quiz/select";
import { generateQuestion } from "@/lib/quiz/generate";
import { getCurrentBloomLevel, pickQuestionType } from "@/lib/quiz/bloom";
import { ensureQuestionBuffer } from "@/lib/quiz/generate-background";
import { SESSION_DEFAULTS } from "@/lib/quiz/types";
import sql from "@/database/pgsql.js";

async function fetchCardQuestion(cardId: string) {
  const rows = await sql`
    SELECT qc.id as card_id, qq.*, qc.state, qc.stability, qc.difficulty,
           qc.elapsed_days, qc.scheduled_days, qc.reps, qc.lapses, qc.due, qc.last_review
    FROM app.quiz_cards qc
    JOIN app.quiz_questions qq ON qc.question_id = qq.id
    WHERE qc.id = ${cardId}::uuid
  `;
  const q = rows[0] ?? null;
  if (q) {
    const fsrsCard = cardFromDB(q);
    q.intervals = getNextIntervals(fsrsCard);
  }
  return q;
}

async function generateAndFetchQuestion(chunkId: string, userId: string) {
  const [chunk] = await sql`
    SELECT c.id, c.text, c.document_id, n.title, n.canvas_course_id
    FROM app.chunks c
    JOIN app.notes n ON c.document_id = n.note_id
    WHERE c.id = ${chunkId}::uuid
  `;
  if (!chunk) return null;

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
    chunk.canvas_course_id,
  );
  if (!question) return null;

  const rows = await sql`
    SELECT qc.id as card_id, qq.*, qc.state, qc.stability, qc.difficulty,
           qc.elapsed_days, qc.scheduled_days, qc.reps, qc.lapses, qc.due, qc.last_review
    FROM app.quiz_cards qc
    JOIN app.quiz_questions qq ON qc.question_id = qq.id
    WHERE qq.id = ${question.id}::uuid
  `;
  const q = rows[0] ?? null;
  if (q) {
    const fsrsCard = cardFromDB(q);
    q.intervals = getNextIntervals(fsrsCard);
  }
  return q;
}

export const POST = withErrorHandler(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const user = await validateSession();
    if (!user) return tracedError("Unauthorized", 401);

    const { id: sessionId } = await params;
    const userId = user.user_id;
    const body = await request.json();
    const { cardId, userAnswer, wasCorrect, responseTimeMs } = body;

    if (!cardId || wasCorrect === undefined)
      return tracedError("cardId and wasCorrect are required", 400);

    // auto-rate: correct = Good (3), incorrect = Again (1)
    const rating = wasCorrect ? 3 : 1;

    const [card] = await sql`
      SELECT qc.*, qq.id as question_id
      FROM app.quiz_cards qc
      JOIN app.quiz_questions qq ON qc.question_id = qq.id
      WHERE qc.id = ${cardId}::uuid AND qc.user_id = ${userId}::uuid
    `;
    if (!card) return tracedError("Card not found", 404);

    // run FSRS
    const fsrsCard = cardFromDB(card);
    const { card: updatedCard } = reviewCard(fsrsCard, rating);
    const dbValues = cardToDB(updatedCard);

    await sql`
      UPDATE app.quiz_cards
      SET state = ${dbValues.state},
          stability = ${dbValues.stability},
          difficulty = ${dbValues.difficulty},
          elapsed_days = ${dbValues.elapsed_days},
          scheduled_days = ${dbValues.scheduled_days},
          reps = ${dbValues.reps},
          lapses = ${dbValues.lapses},
          due = ${dbValues.due}::timestamptz,
          last_review = ${dbValues.last_review}::timestamptz
      WHERE id = ${cardId}::uuid
    `;

    const reviewId = generateUUID();
    await sql`
      INSERT INTO app.quiz_reviews (id, user_id, card_id, question_id, rating, user_answer, was_correct, response_time_ms, session_id)
      VALUES (
        ${reviewId}::uuid,
        ${userId}::uuid,
        ${cardId}::uuid,
        ${card.question_id}::uuid,
        ${rating},
        ${userAnswer || ""},
        ${wasCorrect},
        ${responseTimeMs || null},
        ${sessionId}::uuid
      )
    `;

    await sql`
      UPDATE app.quiz_sessions
      SET total_questions = total_questions + 1,
          correct_count = correct_count + ${wasCorrect ? 1 : 0}
      WHERE id = ${sessionId}::uuid
    `;

    // update streak (fire and forget)
    fetch(new URL("/api/quiz/streak", request.url), {
      method: "POST",
      headers: { cookie: request.headers.get("cookie") || "" },
    }).catch(() => {});

    // get session scope (chunk IDs stored in card_ids column)
    const [session] = await sql`
      SELECT card_ids FROM app.quiz_sessions WHERE id = ${sessionId}::uuid
    `;
    const scopeChunkIds: string[] = session?.card_ids ?? [];

    // get all card IDs answered in this session (to avoid repeats)
    const answeredRows = await sql`
      SELECT card_id FROM app.quiz_reviews
      WHERE session_id = ${sessionId}::uuid AND user_id = ${userId}::uuid
    `;
    const answeredCardIds = answeredRows.map((r: any) => r.card_id);

    // dynamically pick next question
    let nextQuestion: any = null;
    const next = await selectNextQuestion(
      userId,
      scopeChunkIds,
      answeredCardIds,
    );

    if (next?.type === "card") {
      nextQuestion = await fetchCardQuestion(next.cardId);
    } else if (next?.type === "generate") {
      nextQuestion = await generateAndFetchQuestion(next.chunkId, userId);
    }

    // check fatigue
    const [sessionStats] = await sql`
      SELECT total_questions, correct_count FROM app.quiz_sessions
      WHERE id = ${sessionId}::uuid
    `;
    const answered = sessionStats?.total_questions || 0;
    const wrongCount = answered - (sessionStats?.correct_count || 0);
    const fatigueWarning =
      answered > 4 && wrongCount / answered > SESSION_DEFAULTS.fatigueThreshold;

    const isLeech = card.lapses >= SESSION_DEFAULTS.leechThreshold;

    // fire-and-forget: keep question buffer topped up
    if (scopeChunkIds.length > 0) {
      ensureQuestionBuffer(userId, {
        filterChunkIds: scopeChunkIds.slice(0, 200),
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      nextQuestion,
      fatigueWarning,
      isLeech,
      sessionProgress: {
        answered,
        total: scopeChunkIds.length,
        correct: sessionStats?.correct_count || 0,
      },
    });
  },
);
