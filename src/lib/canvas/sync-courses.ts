import {
  canvasIdForBigintColumn,
  normalizeCanvasCourseSelection,
} from "./id";
import { pooled } from "./async-limiter";
import type { CanvasCourse, CanvasRecord } from "./client";

type CourseWithAvailability = CanvasCourse & {
  id: string;
  historical?: true;
  canvasStatus?: string;
  canvasStatusReason?: string;
};

type CanvasCourseResult = {
  data?: CanvasCourse | null;
  forbidden?: boolean;
  error?: string;
};

type CanvasCoursesResult = {
  data?: CanvasCourse[] | null;
  forbidden?: boolean;
  error?: string;
};

type CanvasEnrollmentsResult = {
  data?: CanvasRecord[] | null;
  forbidden?: boolean;
  error?: string;
};

type CanvasCourseLookupClient = {
  getCourse(courseId: string): Promise<CanvasCourseResult>;
};

type CanvasCourseDiscoveryClient = CanvasCourseLookupClient & {
  getDiscoverableCourses(): Promise<CanvasCoursesResult>;
  getSelfEnrollments(): Promise<CanvasEnrollmentsResult>;
};

// Course-list responses intentionally omit some concluded or otherwise hidden
// enrolments.  Keep this low because Canvas applies per-user rate limits.
const HISTORICAL_COURSE_LOOKUP_CONCURRENCY = 4;

export const CANVAS_COURSE_STATUS = Object.freeze({
  CURRENT: "current",
  PAST: "past",
  PENDING: "pending",
  INACCESSIBLE: "inaccessible",
  UNAVAILABLE: "unavailable",
});

const PENDING_ENROLLMENT_STATES = new Set([
  "invited",
  "creation_pending",
  "pending_active",
  "pending_invited",
]);
const INACCESSIBLE_ENROLLMENT_STATES = new Set([
  "inactive",
  "rejected",
  "deleted",
]);

function enrollmentCourseId(enrollment: CanvasRecord): unknown {
  const course = enrollment.course;
  return enrollment.course_id ??
    (typeof course === "object" && course !== null
      ? (course as CanvasRecord).id
      : undefined);
}

function enrollmentState(enrollment: CanvasRecord): string {
  return String(
    enrollment?.enrollment_state ??
      enrollment?.state ??
      enrollment?.workflow_state ??
      "",
  ).toLowerCase();
}

function isPastDate(value: unknown): boolean {
  if (!value) return false;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) && date.getTime() < Date.now();
}

function isFutureDate(value: unknown): boolean {
  if (!value) return false;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) && date.getTime() > Date.now();
}

function canvasStatusForCourse(
  course: CanvasCourse,
  states: Set<string> = new Set(),
): string {
  const hasUsableEnrollment =
    states.has("active") || states.has("completed");
  const hasPendingEnrollment = [...states].some((state) =>
    PENDING_ENROLLMENT_STATES.has(state),
  );
  const hasOnlyInactiveEnrollment =
    states.size > 0 &&
    !hasUsableEnrollment &&
    !hasPendingEnrollment &&
    [...states].every((state) => INACCESSIBLE_ENROLLMENT_STATES.has(state));

  const workflowState = String(course?.workflow_state ?? "").toLowerCase();

  if (workflowState === "deleted" || hasOnlyInactiveEnrollment) {
    return CANVAS_COURSE_STATUS.INACCESSIBLE;
  }
  if (
    (!states.has("active") && states.has("completed")) ||
    course?.concluded === true ||
    workflowState === "completed" ||
    isPastDate(course?.end_at) ||
    isPastDate((course.term as CanvasRecord | null | undefined)?.end_at)
  ) {
    return CANVAS_COURSE_STATUS.PAST;
  }
  if (
    (!hasUsableEnrollment && hasPendingEnrollment) ||
    isFutureDate(course?.start_at) ||
    isFutureDate((course.term as CanvasRecord | null | undefined)?.start_at)
  ) {
    return CANVAS_COURSE_STATUS.PENDING;
  }
  return CANVAS_COURSE_STATUS.CURRENT;
}

function inaccessibleCourse(id: string, states: Set<string>): CourseWithAvailability {
  const inactive = [...states].some((state) =>
    INACCESSIBLE_ENROLLMENT_STATES.has(state),
  );
  return {
    id,
    name: "Canvas course unavailable",
    course_code: "",
    term: null,
    historical: true,
    canvasStatus: CANVAS_COURSE_STATUS.INACCESSIBLE,
    canvasStatusReason: inactive ? "inactive_enrollment" : "access_denied",
  };
}

function unavailableCourse(id: string): CourseWithAvailability {
  return {
    id,
    name: "Canvas course unavailable",
    course_code: "",
    term: null,
    historical: true,
    canvasStatus: CANVAS_COURSE_STATUS.UNAVAILABLE,
    canvasStatusReason: "lookup_failed",
  };
}

function canvasStatusReasonForCourse(course: CanvasCourse, states: Set<string>): string {
  if (String(course?.workflow_state ?? "").toLowerCase() === "deleted") {
    return "deleted_course";
  }
  if (
    [...states].some((state) => INACCESSIBLE_ENROLLMENT_STATES.has(state))
  ) {
    return "inactive_enrollment";
  }
  return "access_denied";
}

/**
 * Whether Canvas currently permits this course to be sent to an import job.
 * This is deliberately independent from local import/sync/file status.
 */
export function isCanvasCourseImportable(
  course: CanvasCourse & { canvasStatus?: string },
): boolean {
  return (
    course?.canvasStatus !== CANVAS_COURSE_STATUS.INACCESSIBLE &&
    course?.canvasStatus !== CANVAS_COURSE_STATUS.UNAVAILABLE
  );
}

export function isCanvasCourseAvailabilityUnresolved(
  course: CanvasCourse & { canvasStatus?: string },
): boolean {
  return course?.canvasStatus === CANVAS_COURSE_STATUS.UNAVAILABLE;
}

function isInaccessibleCourseResult(result: { forbidden?: boolean; error?: string } | null): boolean {
  return (
    result?.forbidden ||
    result?.error === "Canvas API error: 404" ||
    result?.error === "Canvas API error: 410"
  );
}

/**
 * Load the authoritative enrollment source alongside Canvas's faster
 * course-list endpoint. The enrollment endpoint supplies IDs that Canvas can
 * omit from its normal course list, especially historical records.
 */
export async function discoverCanvasCourses(
  client: CanvasCourseDiscoveryClient,
  previousCourseIds: Iterable<unknown> = [],
) {
  const [visibleResult, enrollmentResult] = await Promise.all([
    client.getDiscoverableCourses(),
    client.getSelfEnrollments(),
  ]);

  // Self-enrollments are the authoritative enumeration. If an institution
  // scopes that endpoint, retain the normal course list as a clearly degraded
  // fallback rather than turning a still-valid Canvas connection into a hard
  // failure.
  if (enrollmentResult?.error || enrollmentResult?.forbidden) {
    const courseListAvailable =
      Array.isArray(visibleResult?.data) &&
      !visibleResult?.error &&
      !visibleResult?.forbidden;
    if (courseListAvailable) {
      return {
        data: await resolveAccessibleCanvasCourses(
          client,
          visibleResult.data ?? [],
          [],
          previousCourseIds,
        ),
        forbidden: false,
        degraded: true,
      };
    }
    return {
      data: [],
      forbidden: Boolean(enrollmentResult?.forbidden),
      error:
        enrollmentResult?.error ?? "Canvas could not list this user's enrollments",
    };
  }

  return {
    data: await resolveAccessibleCanvasCourses(
      client,
      visibleResult?.data ?? [],
      enrollmentResult?.data ?? [],
      previousCourseIds,
    ),
    forbidden: false,
    degraded: false,
  };
}

/**
 * Combine Canvas's course list with all of the user's enrollment records and
 * locally remembered course IDs. Every enrollment course ID missing from the
 * list is resolved directly, so historical courses never need a prior local
 * import merely to reach the picker.
 *
 * Inaccessible records remain visible with an explicit Canvas status. That
 * separates Canvas availability from local import status and prevents a
 * missing direct lookup from looking like a deleted local course.
 */
export async function resolveAccessibleCanvasCourses(
  client: CanvasCourseLookupClient,
  visibleCourses: CanvasCourse[] = [],
  enrollments: CanvasRecord[] = [],
  previousCourseIds: Iterable<unknown> = [],
) {
  const coursesById = new Map<string, CourseWithAvailability>();
  const candidateIds: string[] = [];
  const candidateIdSet = new Set<string>();
  const enrollmentStatesByCourseId = new Map<string, Set<string>>();

  function addCandidate(id: string) {
    if (candidateIdSet.has(id)) return;
    candidateIdSet.add(id);
    candidateIds.push(id);
  }

  for (const course of visibleCourses ?? []) {
    const id = canvasIdForBigintColumn(course?.id, "Canvas course ID");
    if (coursesById.has(id)) continue;
    coursesById.set(id, { ...course, id });
    addCandidate(id);
  }

  for (const enrollment of enrollments ?? []) {
    const rawId = enrollmentCourseId(enrollment);
    if (rawId === undefined || rawId === null) continue;
    const id = canvasIdForBigintColumn(rawId, "Canvas course ID");
    const states = enrollmentStatesByCourseId.get(id) ?? new Set();
    const state = enrollmentState(enrollment);
    if (state) states.add(state);
    enrollmentStatesByCourseId.set(id, states);
    addCandidate(id);
  }

  for (const rawId of previousCourseIds ?? []) {
    const id = canvasIdForBigintColumn(rawId, "Canvas course ID");
    addCandidate(id);
  }

  const missingIds = candidateIds.filter((id) => !coursesById.has(id));

  const results = await pooled(
    missingIds.map((id) => async () => ({
      id,
      result: await client.getCourse(id),
    })),
    HISTORICAL_COURSE_LOOKUP_CONCURRENCY,
  );

  for (const [index, outcome] of results.entries()) {
    const requestedId = missingIds[index];
    if (outcome.status !== "fulfilled") {
      coursesById.set(requestedId, unavailableCourse(requestedId));
      continue;
    }
    const { result } = outcome.value;
    const states = enrollmentStatesByCourseId.get(requestedId) ?? new Set();
    if (!result?.data) {
      if (isInaccessibleCourseResult(result)) {
        coursesById.set(requestedId, inaccessibleCourse(requestedId, states));
        continue;
      }
      coursesById.set(requestedId, unavailableCourse(requestedId));
      continue;
    }

    const id = canvasIdForBigintColumn(result.data.id, "Canvas course ID");
    // A response for a different course must never be attached to the
    // historical import record we asked Canvas to resolve.
    if (id !== requestedId || coursesById.has(id)) {
      coursesById.set(requestedId, unavailableCourse(requestedId));
      continue;
    }
    coursesById.set(id, { ...result.data, id, historical: true });
  }

  return candidateIds.map((id) => {
    const course = coursesById.get(id);
    const states = enrollmentStatesByCourseId.get(id) ?? new Set();
    if (!course) return unavailableCourse(id);
    if (
      course.canvasStatus === CANVAS_COURSE_STATUS.INACCESSIBLE ||
      course.canvasStatus === CANVAS_COURSE_STATUS.UNAVAILABLE
    ) {
      return course;
    }

    const canvasStatus = canvasStatusForCourse(course, states);
    return {
      ...course,
      canvasStatus,
      ...(canvasStatus === CANVAS_COURSE_STATUS.INACCESSIBLE
        ? { canvasStatusReason: canvasStatusReasonForCourse(course, states) }
        : {}),
    };
  });
}

/**
 * Match previously imported course IDs to currently importable Canvas records.
 * Explicitly inaccessible or temporarily unresolved courses are never guessed
 * into a job payload; callers can report the latter and retry safely.
 */
export function buildCanvasSyncCourses(
  previousCourseIds: Iterable<unknown>,
  visibleCourses: CanvasCourse[] = [],
) {
  const desiredIds = [...previousCourseIds].map((id) =>
    canvasIdForBigintColumn(id, "Canvas course ID"),
  );
  const desired = new Set(desiredIds);
  const matched = new Set<string>();
  const courses = [];

  for (const course of visibleCourses ?? []) {
    const id = canvasIdForBigintColumn(course?.id, "Canvas course ID");
    if (!desired.has(id) || matched.has(id) || !isCanvasCourseImportable(course)) {
      continue;
    }
    courses.push(normalizeCanvasCourseSelection(course));
    matched.add(id);
  }

  return courses;
}
