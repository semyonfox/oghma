import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  parseJsonObject,
  requireAuth,
  requireValidId,
  type RouteParamsContext,
  withErrorHandler,
  tracedError,
} from "@/lib/api-error";
import logger from "@/lib/logger";
import {
  cardFromDB,
  cardToDB,
  ratingForAnswer,
  reviewCard,
  type FSRSCardRow,
} from "@/lib/quiz/fsrs";
import { gradeAnswer } from "@/lib/quiz/grade";
import { normalizeQuizOptions, stripQuizArtifacts } from "@/lib/quiz/normalize-question";
import { findSessionQuestionFrom } from "@/lib/quiz/session-question";
import { advanceQuizStreak } from "@/lib/quiz/streak";
import { resolveTimeZone } from "@/lib/quiz/time-zone";
import { SESSION_DEFAULTS } from "@/lib/quiz/types";
import type {
  QuestionType,
  QuizAnswerResponse,
  QuizStreakResult,
} from "@/lib/quiz/types";
import { generateUUID } from "@/lib/utils/uuid";
import { validateBody } from "@/lib/validations/schemas";
import sql from "@/database/pgsql";
import type postgres from "postgres";

const MAX_RESPONSE_TIME_MS = 24 * 60 * 60 * 1000;

// older clients also send wasCorrect and nextCardId; both are ignored because
// grading and the next card are decided here
const answerSchema = z.object({
  cardId: z.string().uuid(),
  userAnswer: z.string().max(5000).default(""),
  responseTimeMs: z.number().finite().nullish(),
  timeZone: z.string().max(64).optional(),
});

interface SessionRow {
  card_ids: string[] | null;
  total_questions: number;
  correct_count: number;
}

interface SessionReviewRow {
  card_id: string;
  was_correct: boolean;
}

type ReviewCardRow = FSRSCardRow & {
  id: string;
  question_id: string;
  question_type: QuestionType;
  options: unknown;
  correct_answer: string;
};

interface SessionStatsRow {
  total_questions: number;
  correct_count: number;
}

type AnswerOutcome =
  | { ok: false; message: string; status: number }
  | {
      ok: true;
      duplicate: boolean;
      wasCorrect: boolean;
      lapses: number;
      answered: number;
      cardIds: string[];
      stats: SessionStatsRow;
    };

function responseTime(value: number | null | undefined): number | null {
  if (value === null || value === undefined || value <= 0) return null;
  return Math.round(Math.min(value, MAX_RESPONSE_TIME_MS));
}

/**
 * Locking the session row serialises answers within a session, and every
 * check is repeated under that lock. A card that already has a review in this
 * session is replayed instead of rescheduled, so a retried or doubled submit
 * gets the same outcome without touching FSRS state twice.
 */
async function recordAnswer(
  tx: postgres.TransactionSql,
  userId: string,
  sessionId: string,
  cardId: string,
  userAnswer: string,
  responseTimeMs: number | null,
): Promise<AnswerOutcome> {
  const [session] = await tx<SessionRow[]>`
    SELECT card_ids, total_questions, correct_count
    FROM app.quiz_sessions
    WHERE id = ${sessionId}::uuid AND user_id = ${userId}::uuid
    FOR UPDATE
  `;
  if (!session) return { ok: false, message: "Session not found", status: 404 };

  const cardIds = session.card_ids ?? [];
  if (!cardIds.includes(cardId)) {
    return { ok: false, message: "Card does not belong to this session", status: 403 };
  }

  const reviews = await tx<SessionReviewRow[]>`
    SELECT card_id, was_correct
    FROM app.quiz_reviews
    WHERE session_id = ${sessionId}::uuid AND user_id = ${userId}::uuid
  `;
  const previous = reviews.find((review) => review.card_id === cardId);
  if (previous) {
    return {
      ok: true,
      duplicate: true,
      wasCorrect: previous.was_correct,
      lapses: 0,
      answered: reviews.length,
      cardIds,
      stats: {
        total_questions: session.total_questions,
        correct_count: session.correct_count,
      },
    };
  }
  if (reviews.length >= session.total_questions) {
    return { ok: false, message: "Session already completed", status: 409 };
  }

  const [card] = await tx<ReviewCardRow[]>`
    SELECT qc.id, qc.state, qc.stability, qc.difficulty, qc.elapsed_days,
           qc.scheduled_days, qc.learning_steps, qc.reps, qc.lapses, qc.due,
           qc.last_review, qq.id AS question_id, qq.question_type, qq.options,
           qq.correct_answer
    FROM app.quiz_cards qc
    JOIN app.quiz_questions qq ON qc.question_id = qq.id
    WHERE qc.id = ${cardId}::uuid AND qc.user_id = ${userId}::uuid
    FOR UPDATE OF qc
  `;
  if (!card) return { ok: false, message: "Card not found", status: 404 };

  // grade against the same normalised question the client was shown
  const wasCorrect = gradeAnswer(
    {
      question_type: card.question_type,
      options: normalizeQuizOptions(card.options),
      correct_answer: stripQuizArtifacts(String(card.correct_answer ?? "")),
    },
    userAnswer,
  );
  const rating = ratingForAnswer(wasCorrect, responseTimeMs);
  const next = cardToDB(reviewCard(cardFromDB(card), rating).card);

  await tx`
    UPDATE app.quiz_cards
    SET state = ${next.state},
        stability = ${next.stability},
        difficulty = ${next.difficulty},
        elapsed_days = ${next.elapsed_days},
        scheduled_days = ${next.scheduled_days},
        learning_steps = ${next.learning_steps},
        reps = ${next.reps},
        lapses = ${next.lapses},
        due = ${next.due}::timestamptz,
        last_review = ${next.last_review}::timestamptz
    WHERE id = ${cardId}::uuid AND user_id = ${userId}::uuid
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
      ${userAnswer},
      ${wasCorrect},
      ${responseTimeMs},
      ${sessionId}::uuid
    )
  `;

  const answered = reviews.length + 1;
  const [stats] = await tx<SessionStatsRow[]>`
    UPDATE app.quiz_sessions
    SET correct_count = correct_count + ${wasCorrect ? 1 : 0},
        completed_at = CASE
          WHEN ${answered} >= total_questions THEN COALESCE(completed_at, now())
          ELSE completed_at
        END
    WHERE id = ${sessionId}::uuid AND user_id = ${userId}::uuid
    RETURNING total_questions, correct_count
  `;

  return {
    ok: true,
    duplicate: false,
    wasCorrect,
    lapses: next.lapses,
    answered,
    cardIds,
    stats,
  };
}

async function maybeAdvanceStreak(
  userId: string,
  answered: number,
  totalQuestions: number,
  timeZone: string,
): Promise<QuizStreakResult | null> {
  const threshold = Math.min(SESSION_DEFAULTS.minStreakRound, totalQuestions);
  if (answered < threshold) return null;
  try {
    const result = await advanceQuizStreak(userId, new Date(), timeZone);
    return result.advanced ? result : null;
  } catch (error) {
    // the review already committed, so a streak failure must not fail the answer
    logger.warn("quiz streak update failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export const POST = withErrorHandler(
  async (
    request: NextRequest,
    { params }: RouteParamsContext<{ id: string }>,
  ) => {
    const user = await requireAuth();
    const sessionId = requireValidId((await params).id, "session ID");
    const userId = user.user_id;

    const parsed = validateBody(answerSchema, await parseJsonObject(request));
    if (!parsed.success) return parsed.response;
    const { cardId, userAnswer } = parsed.data;
    const timeZone = resolveTimeZone(parsed.data.timeZone);

    const outcome = await sql.begin((tx: postgres.TransactionSql) =>
      recordAnswer(
        tx,
        userId,
        sessionId,
        cardId,
        userAnswer,
        responseTime(parsed.data.responseTimeMs),
      ),
    );
    if (!outcome.ok) return tracedError(outcome.message, outcome.status);

    const streakResult = outcome.duplicate
      ? null
      : await maybeAdvanceStreak(
          userId,
          outcome.answered,
          outcome.stats.total_questions,
          timeZone,
        );

    const next = await findSessionQuestionFrom(
      userId,
      outcome.cardIds,
      outcome.cardIds.indexOf(cardId) + 1,
    );

    const wrongCount = outcome.answered - outcome.stats.correct_count;
    const body: QuizAnswerResponse = {
      success: true,
      duplicate: outcome.duplicate,
      wasCorrect: outcome.wasCorrect,
      nextQuestion: next?.question ?? null,
      fatigueWarning:
        outcome.answered > 4 &&
        wrongCount / outcome.answered > SESSION_DEFAULTS.fatigueThreshold,
      isLeech: outcome.lapses >= SESSION_DEFAULTS.leechThreshold,
      streakResult,
      sessionProgress: {
        answered: outcome.answered,
        total: outcome.stats.total_questions,
        correct: outcome.stats.correct_count,
      },
    };
    return NextResponse.json(body);
  },
);
