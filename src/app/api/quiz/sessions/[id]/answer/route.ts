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
import type {
  QuizSessionQuestion,
  QuizStreakResult,
} from "@/lib/quiz/types";
import { isFillAnswerCorrect } from "@/lib/quiz/fill-answer";
import { advanceQuizStreak } from "@/lib/quiz/streak";
import sql from "@/database/pgsql";
import type postgres from "postgres";

interface SessionRow {
  id: string;
  card_ids: string[];
  total_questions: number;
}

type ReviewCardRow = Parameters<typeof cardFromDB>[0] & {
  id: string;
  question_id: string;
  correct_answer: string;
  question_type: string;
};

type NextQuestionRow = Parameters<typeof cardFromDB>[0] & QuizSessionQuestion;

interface SessionStatsRow {
  total_questions: number;
  correct_count: number;
}

type AnswerTransactionResult =
  | { ok: false; message: string; status: number }
  | {
      ok: true;
      answered: number;
      card: ReviewCardRow;
      sessionStats: SessionStatsRow;
    };

function checkAnswerCorrect(
  questionType: string,
  userAnswer: string,
  correctAnswer: string,
): boolean {
  if (questionType === "fill_in") {
    return isFillAnswerCorrect(userAnswer, correctAnswer);
  }
  return userAnswer.trim() === correctAnswer.trim();
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
    // wasCorrect is ignored — computed server-side below
    const { cardId, userAnswer, responseTimeMs, nextCardId } = body;

    if (!cardId) return tracedError("cardId is required", 400);

    // Locking the session serializes answers within a session. All membership,
    // duplicate, completion, and card-state checks are repeated under that lock.
    const answer: AnswerTransactionResult = await sql.begin(async (
      tx: postgres.TransactionSql,
    ) => {
      const [session] = await tx<SessionRow[]>`
        SELECT id, card_ids, total_questions
        FROM app.quiz_sessions
        WHERE id = ${sessionId}::uuid AND user_id = ${userId}::uuid
        FOR UPDATE
      `;
      if (!session) {
        return { ok: false, message: "Session not found", status: 404 };
      }

      const sessionCardIds: string[] = session.card_ids ?? [];
      if (!sessionCardIds.includes(cardId)) {
        return {
          ok: false,
          message: "Card does not belong to this session",
          status: 403,
        };
      }

      const [existingReview] = await tx<Array<{ id: string }>>`
        SELECT id
        FROM app.quiz_reviews
        WHERE session_id = ${sessionId}::uuid
          AND user_id = ${userId}::uuid
          AND card_id = ${cardId}::uuid
        LIMIT 1
      `;
      if (existingReview) {
        return { ok: false, message: "Card already answered", status: 409 };
      }

      const [{ count: answeredSoFar }] = await tx<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS count
        FROM app.quiz_reviews
        WHERE session_id = ${sessionId}::uuid AND user_id = ${userId}::uuid
      `;
      if (answeredSoFar >= session.total_questions) {
        return { ok: false, message: "Session already completed", status: 409 };
      }

      const [card] = await tx<ReviewCardRow[]>`
        SELECT qc.id, qc.state, qc.stability, qc.difficulty, qc.elapsed_days,
               qc.scheduled_days, qc.reps, qc.lapses, qc.due, qc.last_review,
               qq.id AS question_id, qq.correct_answer, qq.question_type
        FROM app.quiz_cards qc
        JOIN app.quiz_questions qq ON qc.question_id = qq.id
        WHERE qc.id = ${cardId}::uuid AND qc.user_id = ${userId}::uuid
        FOR UPDATE OF qc
      `;
      if (!card) {
        return { ok: false, message: "Card not found", status: 404 };
      }

      const wasCorrect = checkAnswerCorrect(
        card.question_type,
        String(userAnswer ?? ""),
        String(card.correct_answer ?? ""),
      );
      const ms = responseTimeMs ?? 0;
      const rating = !wasCorrect
        ? 1
        : ms > 20000
          ? 2
          : ms < 5000 && ms > 0
            ? 4
            : 3;
      const { card: updatedCard } = reviewCard(cardFromDB(card), rating);
      const dbValues = cardToDB(updatedCard);

      await tx`
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

      await tx`
        INSERT INTO app.quiz_reviews (
          id, user_id, card_id, question_id, rating, user_answer,
          was_correct, response_time_ms, session_id
        )
        VALUES (
          ${generateUUID()}::uuid,
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

      const [sessionStats] = await tx<SessionStatsRow[]>`
        UPDATE app.quiz_sessions
        SET correct_count = correct_count + ${wasCorrect ? 1 : 0}
        WHERE id = ${sessionId}::uuid AND user_id = ${userId}::uuid
        RETURNING total_questions, correct_count
      `;

      return {
        ok: true,
        answered: answeredSoFar + 1,
        card,
        sessionStats,
      };
    });

    if (!answer.ok) {
      return tracedError(answer.message, answer.status);
    }

    // A completed round advances the daily streak once. Streak failures remain
    // non-fatal because the review itself has already committed successfully.
    let streakResult: QuizStreakResult | null = null;
    if (answer.answered >= SESSION_DEFAULTS.minStreakRound) {
      try {
        const result = await advanceQuizStreak(userId);
        streakResult = result.advanced ? result : null;
      } catch {
        // streak update failing must not break answer submission
      }
    }

    // get next question if nextCardId provided — scoped to userId (C2)
    let nextQuestion: QuizSessionQuestion | null = null;
    if (nextCardId) {
      const rows = await sql<NextQuestionRow[]>`
            SELECT qc.id as card_id, qq.*, qc.state, qc.stability, qc.difficulty,
                   qc.elapsed_days, qc.scheduled_days, qc.reps, qc.lapses, qc.due, qc.last_review
            FROM app.quiz_cards qc
            JOIN app.quiz_questions qq ON qc.question_id = qq.id
            WHERE qc.id = ${nextCardId}::uuid AND qc.user_id = ${userId}::uuid
        `;
      const rawNext = rows[0] ?? null;
      const normalizedQuestion = normalizeQuizQuestion(rawNext);
      if (normalizedQuestion && rawNext) {
        nextQuestion = {
          ...normalizedQuestion,
          intervals: getNextIntervals(
            cardFromDB(rawNext),
          ),
        };
      }
    }

    const wrongCount =
      answer.answered - (answer.sessionStats?.correct_count || 0);
    const fatigueWarning =
      answer.answered > 4 &&
      wrongCount / answer.answered > SESSION_DEFAULTS.fatigueThreshold;

    const isLeech = answer.card.lapses >= SESSION_DEFAULTS.leechThreshold;

    return NextResponse.json({
      success: true,
      nextQuestion,
      fatigueWarning,
      isLeech,
      streakResult,
      sessionProgress: {
        answered: answer.answered,
        total: answer.sessionStats?.total_questions || 0,
        correct: answer.sessionStats?.correct_count || 0,
      },
    });
  },
);
