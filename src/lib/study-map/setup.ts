import sql from "@/database/pgsql";
import { ApiError } from "@/lib/api-errors";
import { autoConfigureStudyMapSafely } from "./jobs";
import { createStudyMap } from "./mutations";
import { currentAcademicYear } from "./types";

const SETUP_BUDGET_MS = 20_000;

/**
 * creates a map for every imported Canvas course that has none yet, so opening
 * the page is enough. deleted course maps are remembered and not recreated
 */
export async function setupStudyMaps(userId: string): Promise<number> {
  const courses = await sql<
    Array<{
      note_id: string;
      title: string;
      course_id: string;
      academic_year: string | null;
    }>
  >`
    SELECT n.note_id, n.title, n.canvas_course_id::text AS course_id, n.canvas_academic_year AS academic_year
    FROM app.notes n
    WHERE n.user_id = ${userId}::uuid AND n.is_folder AND n.deleted_at IS NULL
      AND n.canvas_course_id IS NOT NULL AND n.canvas_module_id IS NULL AND n.canvas_assignment_id IS NULL
      AND EXISTS (SELECT 1 FROM app.tree_items t WHERE t.user_id = n.user_id AND t.note_id = n.note_id)
      AND NOT EXISTS (SELECT 1 FROM app.study_maps m WHERE m.user_id = n.user_id AND m.canvas_course_id = n.canvas_course_id::text)
      AND NOT EXISTS (SELECT 1 FROM app.study_map_dismissed_courses d WHERE d.user_id = n.user_id AND d.canvas_course_id = n.canvas_course_id::text)
      AND NOT EXISTS (SELECT 1 FROM app.user_course_settings s WHERE s.user_id = n.user_id
        AND s.canvas_course_id::text = n.canvas_course_id::text AND NOT s.is_active)
    ORDER BY n.created_at, n.note_id
    LIMIT 100
  `;
  const created: string[] = [];
  for (const course of courses) {
    try {
      created.push(
        await createStudyMap(userId, {
          name: course.title.trim().slice(0, 160) || "Untitled module",
          academicYear:
            course.academic_year?.trim().slice(0, 40) || currentAcademicYear(),
          rootNoteId: course.note_id,
          canvasCourseId: course.course_id,
          syllabusNoteId: null,
        }),
      );
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      // the map limit stops setup; a course another tab mapped first, or whose folder
      // was just deleted, is skipped without losing the courses after it
      if (error.statusCode === 400) break;
    }
  }
  // each setup can fetch the public descriptor and the Canvas outline, so a first visit
  // with many courses would hold the page open for minutes. the worker finishes the rest
  const deadline = Date.now() + SETUP_BUDGET_MS;
  for (const mapId of created) {
    if (Date.now() >= deadline) break;
    await autoConfigureStudyMapSafely(userId, mapId);
  }
  return created.length;
}
