import { NextResponse } from "next/server";
import { requireAuth, requireValidId, withErrorHandler } from "@/lib/api-error";
import { readStudyBody } from "@/lib/study-map/api";
import { examInput, requireExam, validateExamScope } from "@/lib/quiz/exams";
import sql from "@/database/pgsql";

type Context = { params: Promise<{ id: string }> };
export const PUT = withErrorHandler(async (request, context: Context) => {
  const user = await requireAuth();
  const id = requireValidId((await context.params).id);
  await requireExam(user.user_id, id);
  const input = await readStudyBody(request, examInput);
  await validateExamScope(user.user_id, input);
  await sql`UPDATE app.study_exams SET name = ${input.name}, exam_at = ${input.exam_at}::timestamptz,
    canvas_course_id = ${input.canvas_course_id}::bigint, study_map_id = ${input.study_map_id}::uuid,
    note_ids = ${input.note_ids}::uuid[], updated_at = NOW() WHERE user_id = ${user.user_id}::uuid AND id = ${id}::uuid`;
  return NextResponse.json({ success: true });
});
export const DELETE = withErrorHandler(async (_request, context: Context) => {
  const user = await requireAuth();
  const id = requireValidId((await context.params).id);
  await requireExam(user.user_id, id);
  await sql`DELETE FROM app.study_exams WHERE user_id = ${user.user_id}::uuid AND id = ${id}::uuid`;
  return NextResponse.json({ success: true });
});
