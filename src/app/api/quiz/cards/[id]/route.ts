import { NextResponse } from "next/server";
import {
  requireAuth,
  type RouteParamsContext,
  withErrorHandler,
  tracedError,
} from "@/lib/api-error";
import { normalizeQuizQuestion } from "@/lib/quiz/normalize-question";
import sql from "@/database/pgsql";

export const GET = withErrorHandler(
  async (
    _request,
    { params }: RouteParamsContext<{ id: string }>,
  ) => {
    const user = await requireAuth();

    const { id: cardId } = await params;
    const rows = await sql`
      SELECT qc.id as card_id, qq.*, qc.state, qc.stability, qc.difficulty,
             qc.elapsed_days, qc.scheduled_days, qc.reps, qc.lapses, qc.due, qc.last_review
      FROM app.quiz_cards qc
      JOIN app.quiz_questions qq ON qc.question_id = qq.id
      WHERE qc.id = ${cardId}::uuid AND qc.user_id = ${user.user_id}::uuid
    `;

    if (!rows[0]) return tracedError("Card not found", 404);

    return NextResponse.json({ question: normalizeQuizQuestion(rows[0]) });
  },
);
