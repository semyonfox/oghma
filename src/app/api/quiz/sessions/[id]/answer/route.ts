import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import {
  cardFromDB,
  reviewCard,
  cardToDB,
  getNextIntervals,
} from "@/lib/quiz/fsrs";
import { normalizeQuizQuestion } from "@/lib/quiz/normalize-question";
import { generateUUID } from "@/lib/utils/uuid";
import { SESSION_DEFAULTS } from "@/lib/quiz/types";
import sql from "@/database/pgsql.js";

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
    const { cardId, userAnswer, wasCorrect, responseTimeMs, nextCardId } = body;

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
        SET correct_count = correct_count + ${wasCorrect ? 1 : 0}
        WHERE id = ${sessionId}::uuid
    `;

    // update streak (fire and forget)
    fetch(new URL("/api/quiz/streak", request.url), {
      method: "POST",
      headers: { cookie: request.headers.get("cookie") || "" },
    }).catch(() => {});

    // get next question if nextCardId provided
    let nextQuestion: any = null;
    if (nextCardId) {
      const rows = await sql`
            SELECT qc.id as card_id, qq.*, qc.state, qc.stability, qc.difficulty,
                   qc.elapsed_days, qc.scheduled_days, qc.reps, qc.lapses, qc.due, qc.last_review
            FROM app.quiz_cards qc
            JOIN app.quiz_questions qq ON qc.question_id = qq.id
            WHERE qc.id = ${nextCardId}::uuid
        `;
      const rawNext = rows[0] ?? null;
      nextQuestion = normalizeQuizQuestion(rawNext);
      if (nextQuestion && rawNext) {
        const nextFsrs = cardFromDB(rawNext);
        nextQuestion.intervals = getNextIntervals(nextFsrs);
      }
    }

    // check fatigue
    const [sessionStats] = await sql`
        SELECT total_questions, correct_count FROM app.quiz_sessions
        WHERE id = ${sessionId}::uuid
    `;
    const answered = (
      await sql`
        SELECT COUNT(*)::int as count FROM app.quiz_reviews
        WHERE session_id = ${sessionId}::uuid
    `
    )[0].count;
    const wrongCount = answered - (sessionStats?.correct_count || 0);
    const fatigueWarning =
      answered > 4 && wrongCount / answered > SESSION_DEFAULTS.fatigueThreshold;

    const isLeech = card.lapses >= SESSION_DEFAULTS.leechThreshold;

    return NextResponse.json({
      success: true,
      nextQuestion,
      fatigueWarning,
      isLeech,
      sessionProgress: {
        answered,
        total: sessionStats?.total_questions || 0,
        correct: sessionStats?.correct_count || 0,
      },
    });
  },
);
