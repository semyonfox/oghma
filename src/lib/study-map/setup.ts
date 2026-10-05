import sql from "@/database/pgsql";
import { ApiError } from "@/lib/api-errors";
import { autoConfigureStudyMap } from "./jobs";
import { createStudyMap } from "./mutations";
import { currentAcademicYear } from "./types";

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
  let created = 0;
  for (const course of courses) {
    let mapId: string;
    try {
      mapId = await createStudyMap(userId, {
        name: course.title.trim().slice(0, 160) || "Untitled module",
        academicYear:
          course.academic_year?.trim().slice(0, 40) || currentAcademicYear(),
        rootNoteId: course.note_id,
        canvasCourseId: course.course_id,
        syllabusNoteId: null,
      });
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      // another tab created this course's map first
      if (error.statusCode === 409) continue;
      break;
    }
    created += 1;
    try {
      await autoConfigureStudyMap(userId, mapId);
    } catch (error) {
      // an oversized course still gets its map; the worker retries sources later
      if (!(error instanceof ApiError)) throw error;
    }
  }
  return created;
}
