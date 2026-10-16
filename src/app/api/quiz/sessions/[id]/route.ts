import { NextResponse } from "next/server";
import {
  requireAuth,
  requireValidId,
  type RouteParamsContext,
  withErrorHandler,
  tracedError,
} from "@/lib/api-error";
import { findSessionQuestionFrom } from "@/lib/quiz/session-question";
import type { QuizSessionResumeResponse } from "@/lib/quiz/types";
import sql from "@/database/pgsql";

interface SessionRow {
  card_ids: string[] | null;
  correct_count: number;
  completed_at: Date | string | null;
}

interface AnsweredRow {
  card_id: string;
}

export const GET = withErrorHandler(
  async (
    _request,
    { params }: RouteParamsContext<{ id: string }>,
  ) => {
    const user = await requireAuth();
    const id = requireValidId((await params).id, "session ID");

    const [session] = await sql<SessionRow[]>`
        SELECT card_ids, correct_count, completed_at
        FROM app.quiz_sessions
        WHERE id = ${id}::uuid AND user_id = ${user.user_id}::uuid
    `;
    if (!session) return tracedError("Session not found", 404);

    const cardIds = session.card_ids ?? [];
    const answered = await sql<AnsweredRow[]>`
        SELECT card_id FROM app.quiz_reviews
        WHERE session_id = ${id}::uuid AND user_id = ${user.user_id}::uuid
    `;

    // resume after the furthest answered card. skipped cards leave no review,
    // so counting reviews would land on a card that was already answered
    const lastAnswered = Math.max(
      -1,
      ...answered.map(({ card_id }) => cardIds.indexOf(card_id)),
    );
    const next = session.completed_at
      ? null
      : await findSessionQuestionFrom(user.user_id, cardIds, lastAnswered + 1);

    const body: QuizSessionResumeResponse = {
      cardIds,
      currentIndex: next?.index ?? cardIds.length,
      answeredCount: answered.length,
      correct_count: session.correct_count,
      completed: next === null,
      question: next?.question ?? null,
    };
    return NextResponse.json(body);
  },
);

export const DELETE = withErrorHandler(
  async (
    _request,
    { params }: RouteParamsContext<{ id: string }>,
  ) => {
    const user = await requireAuth();
    const id = requireValidId((await params).id, "session ID");

    await sql`
        UPDATE app.quiz_sessions
        SET completed_at = COALESCE(completed_at, now())
        WHERE id = ${id}::uuid AND user_id = ${user.user_id}::uuid
    `;

    return NextResponse.json({ success: true });
  },
);
