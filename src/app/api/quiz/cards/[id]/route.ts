import sql from "@/database/pgsql";
import { checkRateLimit } from "@/lib/rate-limiter";
import { manualQuizCardSchema, validateBody } from "@/lib/validations/schemas";
import { NextResponse } from "next/server";
import {
  requireAuth,
  parseJsonObject,
  requireValidId,
  type RouteParamsContext,
  withErrorHandler,
  tracedError,
} from "@/lib/api-error";
import { loadSessionQuestion } from "@/lib/quiz/session-question";

export const GET = withErrorHandler(
  async (
    _request,
    { params }: RouteParamsContext<{ id: string }>,
  ) => {
    const user = await requireAuth();

    const cardId = requireValidId((await params).id, "card ID");
    const question = await loadSessionQuestion(user.user_id, cardId);
    if (!question) return tracedError("Card not found", 404);

    return NextResponse.json({ question });
  },
);

export const PATCH = withErrorHandler(async (request, { params }: RouteParamsContext<{ id: string }>) => {
  const user = await requireAuth();
  const limited = await checkRateLimit("quiz-card-write", user.user_id);
  if (limited) return limited;
  const cardId = requireValidId((await params).id, "card ID");
  const parsed = validateBody(manualQuizCardSchema, await parseJsonObject(request));
  if (!parsed.success) return parsed.response;
  const { front, back } = parsed.data;
  const [updated] = await sql`
    UPDATE app.quiz_questions qq
    SET question_text = ${front}, correct_answer = ${back}, updated_at = now()
    FROM app.quiz_cards qc, app.notes n
    WHERE qc.id = ${cardId}::uuid AND qc.user_id = ${user.user_id}::uuid
      AND qq.id = qc.question_id AND qq.user_id = qc.user_id AND qq.origin = 'manual'
      AND n.note_id = qq.note_id AND n.user_id = qq.user_id AND n.deleted_at IS NULL
    RETURNING qq.id
  `;
  return updated ? NextResponse.json({ success: true }) : tracedError("Manual card not found", 404);
});

export const DELETE = withErrorHandler(async (_request, { params }: RouteParamsContext<{ id: string }>) => {
  const user = await requireAuth();
  const limited = await checkRateLimit("quiz-card-write", user.user_id);
  if (limited) return limited;
  const cardId = requireValidId((await params).id, "card ID");
  // deleting the question cascades to its owned card, reviews remain history
  const [deleted] = await sql`
    DELETE FROM app.quiz_questions qq USING app.quiz_cards qc
    WHERE qc.id = ${cardId}::uuid AND qc.user_id = ${user.user_id}::uuid
      AND qq.id = qc.question_id AND qq.user_id = qc.user_id AND qq.origin = 'manual'
    RETURNING qq.id
  `;
  return deleted ? NextResponse.json({ success: true }) : tracedError("Manual card not found", 404);
});
