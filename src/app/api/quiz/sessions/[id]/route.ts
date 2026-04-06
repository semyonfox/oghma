import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import { cardFromDB, getNextIntervals } from "@/lib/quiz/fsrs";
import { normalizeQuizQuestion } from "@/lib/quiz/normalize-question";
import sql from "@/database/pgsql.js";

export const GET = withErrorHandler(
  async (
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const user = await validateSession();
    if (!user) return tracedError("Unauthorized", 401);

    const { id } = await params;
    const [session] = await sql`
        SELECT * FROM app.quiz_sessions
        WHERE id = ${id}::uuid AND user_id = ${user.user_id}::uuid
    `;

    if (!session) return tracedError("Session not found", 404);

    const cardIds: string[] = session.card_ids ?? [];

    // figure out how many questions have already been answered in this session
    const [{ count: answeredCount }] = await sql`
        SELECT count(*)::int as count FROM app.quiz_reviews
        WHERE session_id = ${id}::uuid AND user_id = ${user.user_id}::uuid
    `;
    const currentIndex = answeredCount;

    // load the current question (first unanswered card)
    let question = null;
    if (currentIndex < cardIds.length) {
      const rows = await sql`
            SELECT qc.id as card_id, qq.*, qc.state, qc.stability, qc.difficulty,
                   qc.elapsed_days, qc.scheduled_days, qc.reps, qc.lapses, qc.due, qc.last_review
            FROM app.quiz_cards qc
            JOIN app.quiz_questions qq ON qc.question_id = qq.id
            WHERE qc.id = ${cardIds[currentIndex]}::uuid
        `;
      question = normalizeQuizQuestion(rows[0] ?? null);
      if (question) {
        const fsrsCard = cardFromDB(question);
        question.intervals = getNextIntervals(fsrsCard);
      }
    }

    return NextResponse.json({
      ...session,
      cardIds,
      currentIndex,
      question,
    });
  },
);

export const DELETE = withErrorHandler(
  async (
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const user = await validateSession();
    if (!user) return tracedError("Unauthorized", 401);

    const { id } = await params;
    await sql`
        UPDATE app.quiz_sessions
        SET completed_at = now()
        WHERE id = ${id}::uuid AND user_id = ${user.user_id}::uuid
    `;

    return NextResponse.json({ success: true });
  },
);
