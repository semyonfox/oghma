import { z } from "zod";
import sql from "@/database/pgsql";
import { ApiError } from "@/lib/api-errors";
import { cardFromDB, type FSRSCardRow } from "./fsrs";
import { examPlan } from "./exam-plan";
import { dateKeyInTimeZone } from "./time-zone";
import { getStudyMapSnapshot } from "@/lib/study-map/repository";
import { summariseExamCorpus } from "@/lib/study-map/exam-stats";
import { effectiveAssociations } from "@/lib/study-map/types";

export const examInput = z
  .object({
    name: z.string().trim().min(1).max(160),
    exam_at: z.iso
      .datetime({ offset: true })
      .refine(
        (value) => new Date(value).getTime() <= Date.now() + 3650 * 86400000,
        "Exam must be within ten years",
      ),
    canvas_course_id: z
      .string()
      .regex(/^\d{1,18}$/)
      .nullable()
      .default(null),
    study_map_id: z.uuid().nullable().default(null),
    note_ids: z.array(z.uuid()).max(500).nullable().default(null),
  })
  .strict();
export interface StudyExam extends z.output<typeof examInput> {
  id: string;
}
export async function listExams(userId: string): Promise<StudyExam[]> {
  return sql<StudyExam[]>`
    SELECT id, name,
      to_char(exam_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS exam_at,
      canvas_course_id::text, study_map_id, note_ids
    FROM app.study_exams WHERE user_id = ${userId}::uuid ORDER BY exam_at, id
  `;
}
export async function examScopeNotes(
  userId: string,
  exam: StudyExam,
): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    SELECT n.note_id AS id FROM app.notes n
    WHERE n.user_id = ${userId}::uuid AND n.deleted_at IS NULL AND n.is_folder = FALSE
      AND (${exam.canvas_course_id}::bigint IS NULL OR n.canvas_course_id = ${exam.canvas_course_id}::bigint)
      AND (${exam.note_ids}::uuid[] IS NULL OR n.note_id = ANY(${exam.note_ids}::uuid[]))
      AND (${exam.study_map_id}::uuid IS NULL OR EXISTS (
        SELECT 1 FROM app.study_materials sm WHERE sm.user_id = n.user_id AND sm.note_id = n.note_id
          AND sm.map_id = ${exam.study_map_id}::uuid AND sm.excluded = FALSE))
  `;
  return rows.map((row) => row.id);
}
export async function requireExam(userId: string, id: string) {
  const exam = (await listExams(userId)).find((exam) => exam.id === id);
  if (!exam) throw new ApiError(404, "Exam not found");
  return exam;
}
export async function validateExamScope(
  userId: string,
  input: z.output<typeof examInput>,
) {
  if (input.study_map_id) {
    const maps =
      await sql`SELECT id FROM app.study_maps WHERE user_id = ${userId}::uuid AND id = ${input.study_map_id}::uuid`;
    if (!maps.length) throw new ApiError(400, "Study map not found");
  }
  if (input.note_ids?.length) {
    const notes = await sql<
      { id: string }[]
    >`SELECT note_id AS id FROM app.notes WHERE user_id = ${userId}::uuid AND note_id = ANY(${input.note_ids}::uuid[]) AND deleted_at IS NULL`;
    if (new Set(input.note_ids).size !== notes.length)
      throw new ApiError(400, "Note not found");
  }
}
export async function loadExamPlans(
  userId: string,
  timeZone: string,
  now = new Date(),
) {
  const exams = await listExams(userId);
  return Promise.all(
    exams.map(async (exam) => {
      const examAt = new Date(exam.exam_at);
      const daysLeft =
        examAt <= now
          ? 0
          : 1 +
            Math.max(
              0,
              Math.ceil(
                (Date.parse(
                  `${dateKeyInTimeZone(examAt, timeZone)}T00:00:00Z`,
                ) -
                  Date.parse(`${dateKeyInTimeZone(now, timeZone)}T00:00:00Z`)) /
                  86400000,
              ),
            );
      const noteIds = await examScopeNotes(userId, exam);
      const cards = await sql<
        (FSRSCardRow & { id: string; note_id: string })[]
      >`
      SELECT qc.*, qq.note_id FROM app.quiz_cards qc
      JOIN app.quiz_questions qq ON qq.id = qc.question_id AND qq.user_id = qc.user_id
      JOIN app.notes n ON n.note_id = qq.note_id AND n.user_id = qc.user_id
      LEFT JOIN app.user_course_settings ucs ON ucs.user_id = qc.user_id AND ucs.canvas_course_id = n.canvas_course_id
      WHERE qc.user_id = ${userId}::uuid AND qq.note_id = ANY(${noteIds}::uuid[])
        AND (ucs.is_active IS NULL OR ucs.is_active = TRUE)
    `;
      const weights = new Map<string, number>();
      if (exam.study_map_id) {
        const snapshot = await getStudyMapSnapshot(userId, exam.study_map_id);
        const corpus = summariseExamCorpus(
          snapshot.papers,
          snapshot.map.topics,
          snapshot.map.taxonomyVersion,
        );
        const marks = new Map(
          corpus.topics.map((topic) => [
            topic.topicId,
            topic.exclusiveMarks + topic.sharedMarks,
          ]),
        );
        for (const material of snapshot.materials) {
          const values = effectiveAssociations(
            material,
            snapshot.map.taxonomyVersion,
          ).map((topic) => marks.get(topic.topicId) ?? 0);
          const weight = values.reduce((sum, value) => sum + value, 0);
          if (weight > 0) weights.set(material.noteId, weight);
        }
      }
      return {
        ...exam,
        daysLeft,
        weighted: weights.size > 0,
        plan: examPlan(
          cards.map((row) => ({
            id: row.id,
            card: cardFromDB(row),
            weight: weights.get(row.note_id),
          })),
          daysLeft,
          { now, examAt, timeZone },
        ),
      };
    }),
  );
}
