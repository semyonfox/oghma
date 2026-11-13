import { NextResponse } from "next/server";
import sql from "@/database/pgsql";
import { parseJsonObject, requireAuth, requireValidId, withErrorHandler, tracedError, type RouteParamsContext } from "@/lib/api-error";
import { manualQuizCardSchema, validateBody } from "@/lib/validations/schemas";
import { checkRateLimit } from "@/lib/rate-limiter";

export const GET = withErrorHandler(async (_request, { params }: RouteParamsContext<{ id: string }>) => {
  const user = await requireAuth();
  const noteId = requireValidId((await params).id, "note ID");
  const [note] = await sql`SELECT note_id FROM app.notes WHERE note_id = ${noteId}::uuid AND user_id = ${user.user_id}::uuid AND deleted_at IS NULL`;
  if (!note) return tracedError("Note not found", 404);
  const cards = await sql`
    SELECT qc.id, qq.question_text AS front, qq.correct_answer AS back, qq.source_quote
    FROM app.quiz_questions qq
    JOIN app.quiz_cards qc ON qc.question_id = qq.id AND qc.user_id = qq.user_id
    WHERE qq.note_id = ${noteId}::uuid AND qq.user_id = ${user.user_id}::uuid AND qq.origin = 'manual'
    ORDER BY qq.created_at DESC
  `;
  return NextResponse.json({ cards });
});

export const POST = withErrorHandler(async (request, { params }: RouteParamsContext<{ id: string }>) => {
  const user = await requireAuth();
  const limited = await checkRateLimit("quiz-card-write", user.user_id);
  if (limited) return limited;
  const noteId = requireValidId((await params).id, "note ID");
  const parsed = validateBody(manualQuizCardSchema, await parseJsonObject(request));
  if (!parsed.success) return parsed.response;
  const { front, back, sourceQuote } = parsed.data;
  const card = await sql.begin(async (tx) => {
    const [note] = await tx`
      SELECT note_id FROM app.notes
      WHERE note_id = ${noteId}::uuid AND user_id = ${user.user_id}::uuid
        AND deleted_at IS NULL AND is_folder = false
      FOR SHARE
    `;
    if (!note) return null;
    const [question] = await tx<{ id: string }[]>`
      INSERT INTO app.quiz_questions (user_id, note_id, origin, question_type, bloom_level, question_text, correct_answer, source_quote)
      VALUES (${user.user_id}::uuid, ${noteId}::uuid, 'manual', 'basic', 1, ${front}, ${back}, ${sourceQuote ?? null})
      RETURNING id
    `;
    const [created] = await tx<{ id: string }[]>`
      INSERT INTO app.quiz_cards (user_id, question_id)
      VALUES (${user.user_id}::uuid, ${question.id}::uuid) RETURNING id
    `;
    return created;
  });
  return card ? NextResponse.json({ card }, { status: 201 }) : tracedError("Note not found", 404);
});
