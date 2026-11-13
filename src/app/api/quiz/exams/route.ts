import { NextResponse } from "next/server";
import { requireAuth, withErrorHandler } from "@/lib/api-error";
import { readStudyBody } from "@/lib/study-map/api";
import { examInput, loadExamPlans, validateExamScope } from "@/lib/quiz/exams";
import { resolveTimeZone } from "@/lib/quiz/time-zone";
import sql from "@/database/pgsql";

export const GET = withErrorHandler(async (request) => {
  const user = await requireAuth();
  return NextResponse.json(
    await loadExamPlans(
      user.user_id,
      resolveTimeZone(new URL(request.url).searchParams.get("tz")),
    ),
  );
});
export const POST = withErrorHandler(async (request) => {
  const user = await requireAuth();
  const input = await readStudyBody(request, examInput);
  await validateExamScope(user.user_id, input);
  const [exam] =
    await sql`INSERT INTO app.study_exams (user_id, name, exam_at, canvas_course_id, study_map_id, note_ids)
    VALUES (${user.user_id}::uuid, ${input.name}, ${input.exam_at}::timestamptz, ${input.canvas_course_id}::bigint, ${input.study_map_id}::uuid, ${input.note_ids}::uuid[]) RETURNING id`;
  return NextResponse.json(exam, { status: 201 });
});
