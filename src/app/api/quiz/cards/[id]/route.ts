import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import { normalizeQuizQuestion } from "@/lib/quiz/normalize-question";
import sql from "@/database/pgsql.js";

export const GET = withErrorHandler(
  async (
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const user = await validateSession();
    if (!user) return tracedError("Unauthorized", 401);

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
