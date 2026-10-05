import type { CanvasRecord } from "./client";
import {
  addJsonEntry,
  addMarkdownEntry,
  collectDownloadableAttachments,
  collectFile,
  collectGenericObject,
  collectGenericPaginated,
  collectSubmissionAttachments,
  entryName,
  getJson,
  getPaginatedJson,
  isRecord,
  pathWithQuery,
  recordArray,
  sanitizeZipPart,
} from "./raw-export-helpers";
import type { CourseExportContext } from "./raw-export-types";

const SUBMISSION_INCLUDES = [
  "submission_comments",
  "rubric_assessment",
  "submission_history",
  "attachments",
  "assignment",
];

async function collectAssignment(
  context: CourseExportContext,
  assignmentSummary: CanvasRecord,
) {
  const { client, courseId, coursePath, archive, state } = context;
  const id = assignmentSummary.id;
  const name = sanitizeZipPart(assignmentSummary.name, `assignment-${id}`);
  const assignment = await getJson(
    client,
    pathWithQuery(`/courses/${courseId}/assignments/${id}`, {
      include: ["submission", "rubric"],
    }),
    `${coursePath}/assignments/${name}/assignment.json`,
    state.skipped,
  );
  if (isRecord(assignment)) {
    addJsonEntry(
      archive.textEntries,
      state.seenPaths,
      `${coursePath}/assignments/${name}/assignment.json`,
      assignment,
    );
    addMarkdownEntry(
      archive.textEntries,
      state.seenPaths,
      `${coursePath}/assignments/${name}/assignment.md`,
      assignment.name ?? name,
      assignment.description,
      {
        due_at: assignment.due_at,
        points_possible: assignment.points_possible,
      },
    );
    for (const attachment of recordArray(assignment.attachments)) {
      collectFile(
        archive.downloads,
        attachment,
        `${coursePath}/assignments/${name}/attachments/${entryName(attachment)}`,
        state,
      );
    }
    collectDownloadableAttachments(
      assignment,
      `${coursePath}/assignments/${name}`,
      archive.downloads,
      state,
    );
  }
  await collectAssignmentSubmission(context, id, name);
  await collectGenericPaginated(
    client,
    pathWithQuery(`/courses/${courseId}/assignments/${id}/peer_reviews`, {
      include: ["submission_comments", "user"],
    }),
    `${coursePath}/assignments/${name}/peer-reviews.json`,
    archive,
    state,
  );
}

async function collectAssignmentSubmission(
  context: CourseExportContext,
  assignmentId: unknown,
  name: string,
) {
  const { client, courseId, coursePath, archive, state } = context;
  const submission = await getJson(
    client,
    pathWithQuery(
      `/courses/${courseId}/assignments/${assignmentId}/submissions/self`,
      { include: SUBMISSION_INCLUDES },
    ),
    `${coursePath}/assignments/${name}/my-submission.json`,
    state.skipped,
  );
  if (!isRecord(submission)) return;
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${coursePath}/assignments/${name}/my-submission.json`,
    submission,
  );
  collectSubmissionAttachments(
    archive.downloads,
    submission,
    `${coursePath}/assignments/${name}/my-submission-attachments`,
    state,
  );
  collectDownloadableAttachments(
    submission,
    `${coursePath}/assignments/${name}/my-submission`,
    archive.downloads,
    state,
  );
}

export async function collectCourseAssignments(context: CourseExportContext) {
  const { client, courseId, coursePath, archive, state, summary } = context;
  const groups = await getPaginatedJson(
    client,
    pathWithQuery(`/courses/${courseId}/assignment_groups`, {
      include: ["assignments", "submission"],
    }),
    `${coursePath}/assignments/assignment-groups.json`,
    state.skipped,
  );
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${coursePath}/assignments/assignment-groups.json`,
    groups,
  );
  const assignments = await getPaginatedJson(
    client,
    pathWithQuery(`/courses/${courseId}/assignments`, {
      include: ["submission", "rubric"],
    }),
    `${coursePath}/assignments/assignments.json`,
    state.skipped,
  );
  summary.sources.assignments = assignments.length;
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${coursePath}/assignments/assignments.json`,
    assignments,
  );
  const submissions = await getPaginatedJson(
    client,
    pathWithQuery(`/courses/${courseId}/students/submissions`, {
      student_ids: ["self"],
      include: SUBMISSION_INCLUDES,
    }),
    `${coursePath}/submissions/my-submissions.json`,
    state.skipped,
  );
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${coursePath}/submissions/my-submissions.json`,
    submissions,
  );
  for (const assignment of assignments)
    await collectAssignment(context, assignment);
  await collectGenericObject(
    client,
    pathWithQuery("/users/self/missing_submissions", {
      course_ids: [courseId],
      include: ["planner_overrides", "course"],
    }),
    `${coursePath}/assignments/missing-submissions.json`,
    archive,
    state,
  );
}

async function collectQuiz(
  context: CourseExportContext,
  quizSummary: CanvasRecord,
) {
  const { client, courseId, coursePath, archive, state } = context;
  const id = quizSummary.id;
  const name = sanitizeZipPart(quizSummary.title, `quiz-${id}`);
  const quiz = await getJson(
    client,
    `/courses/${courseId}/quizzes/${id}`,
    `${coursePath}/quizzes/${name}/quiz.json`,
    state.skipped,
  );
  if (isRecord(quiz)) {
    addJsonEntry(
      archive.textEntries,
      state.seenPaths,
      `${coursePath}/quizzes/${name}/quiz.json`,
      quiz,
    );
    addMarkdownEntry(
      archive.textEntries,
      state.seenPaths,
      `${coursePath}/quizzes/${name}/quiz.md`,
      quiz.title ?? name,
      quiz.description,
      { due_at: quiz.due_at, points_possible: quiz.points_possible },
    );
  }
  const submissions = await getPaginatedJson(
    client,
    `/courses/${courseId}/quizzes/${id}/submissions`,
    `${coursePath}/quizzes/${name}/submissions.json`,
    state.skipped,
  );
  if (submissions.length > 0) {
    addJsonEntry(
      archive.textEntries,
      state.seenPaths,
      `${coursePath}/quizzes/${name}/submissions.json`,
      submissions,
    );
  }
  await collectGenericObject(
    client,
    `/courses/${courseId}/quizzes/${id}/submissions/self`,
    `${coursePath}/quizzes/${name}/my-submission.json`,
    archive,
    state,
  );
  await collectGenericPaginated(
    client,
    `/courses/${courseId}/quizzes/${id}/questions`,
    `${coursePath}/quizzes/${name}/questions.json`,
    archive,
    state,
  );
}

export async function collectCourseQuizzes(context: CourseExportContext) {
  const { client, courseId, coursePath, archive, state, summary } = context;
  const quizzes = await getPaginatedJson(
    client,
    `/courses/${courseId}/quizzes`,
    `${coursePath}/quizzes/quizzes.json`,
    state.skipped,
  );
  summary.sources.quizzes = quizzes.length;
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${coursePath}/quizzes/quizzes.json`,
    quizzes,
  );
  for (const quiz of quizzes) await collectQuiz(context, quiz);
}
