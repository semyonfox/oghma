import { cleanCourseName } from "./content-formatting";
import type { CanvasCourseSelection } from "./id";
import {
  collectCourseAssignments,
  collectCourseQuizzes,
} from "./raw-export-course-assessments";
import {
  collectCourseAnnouncements,
  collectCourseDiscussions,
  collectCoursePages,
} from "./raw-export-course-content";
import {
  collectCourseFiles,
  collectCourseModules,
  collectCourseOverview,
} from "./raw-export-course-structure";
import { collectGroupArchive } from "./raw-export-groups";
import {
  addJsonEntry,
  collectGenericObject,
  collectGenericPaginated,
  getPaginatedJson,
  pathWithQuery,
  sanitizeZipPart,
} from "./raw-export-helpers";
import type {
  CanvasRawExportArchive,
  CourseExportContext,
  CourseSummary,
  RawExportClient,
  RawExportState,
} from "./raw-export-types";

async function collectCoursePlanning(context: CourseExportContext) {
  const { client, courseId, coursePath, archive, state } = context;
  const events = await getPaginatedJson(
    client,
    pathWithQuery("/calendar_events", {
      context_codes: [`course_${courseId}`],
    }),
    `${coursePath}/calendar/calendar-events.json`,
    state.skipped,
  );
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${coursePath}/calendar/calendar-events.json`,
    events,
  );
  const plannerItems = await getPaginatedJson(
    client,
    pathWithQuery("/planner/items", { context_codes: [`course_${courseId}`] }),
    `${coursePath}/planner/planner-items.json`,
    state.skipped,
  );
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${coursePath}/planner/planner-items.json`,
    plannerItems,
  );
}

async function collectCourseGrades(context: CourseExportContext) {
  const { client, courseId, coursePath, archive, state } = context;
  const standards = await getPaginatedJson(
    client,
    `/courses/${courseId}/grading_standards`,
    `${coursePath}/grades/grading-standards.json`,
    state.skipped,
  );
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${coursePath}/grades/grading-standards.json`,
    standards,
  );
  const enrollments = await getPaginatedJson(
    client,
    pathWithQuery("/users/self/enrollments", {
      course_id: courseId,
      state: ["active", "invited", "completed", "inactive"],
    }),
    `${coursePath}/grades/my-enrollments.json`,
    state.skipped,
  );
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${coursePath}/grades/my-enrollments.json`,
    enrollments,
  );
}

async function collectCourseRubrics(context: CourseExportContext) {
  const { client, courseId, coursePath, archive, state } = context;
  const rubrics = await collectGenericPaginated(
    client,
    pathWithQuery(`/courses/${courseId}/rubrics`, {
      include: ["associations", "assessments"],
    }),
    `${coursePath}/rubrics/rubrics.json`,
    archive,
    state,
  );
  for (const rubric of rubrics) {
    if (!rubric.id) continue;
    const name = sanitizeZipPart(rubric.title, `rubric-${rubric.id}`);
    await collectGenericObject(
      client,
      pathWithQuery(`/courses/${courseId}/rubrics/${rubric.id}`, {
        include: ["assessments", "graded_assessments", "peer_assessments"],
        style: "full",
      }),
      `${coursePath}/rubrics/${name}.json`,
      archive,
      state,
    );
  }
}

async function collectCourseGroups(context: CourseExportContext) {
  const { client, courseId, coursePath, archive, state } = context;
  const groups = await collectGenericPaginated(
    client,
    `/courses/${courseId}/groups`,
    `${coursePath}/groups/groups.json`,
    archive,
    state,
  );
  for (const group of groups)
    await collectGroupArchive(client, group, archive, state);
}

export async function collectCourseArchive(
  client: RawExportClient,
  course: CanvasCourseSelection,
  archive: CanvasRawExportArchive,
  state: RawExportState,
) {
  const courseId = String(course.id);
  const { title } = cleanCourseName(
    course.course_code,
    course.name,
    course.term,
  );
  const coursePath = sanitizeZipPart(title, `course-${courseId}`);
  const summary: CourseSummary = { id: course.id, title, sources: {} };
  const context: CourseExportContext = {
    client,
    courseId,
    coursePath,
    archive,
    state,
    summary,
  };
  await collectCourseOverview(context, course);
  await collectCourseModules(context);
  await collectCourseFiles(context);
  await collectCoursePages(context);
  await collectCourseAnnouncements(context);
  await collectCourseDiscussions(context);
  await collectCourseAssignments(context);
  await collectCourseQuizzes(context);
  await collectCoursePlanning(context);
  await collectCourseGrades(context);
  await collectCourseRubrics(context);
  await collectCourseGroups(context);
  archive.manifest.courses.push(summary);
}
