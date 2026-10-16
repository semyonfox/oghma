/**
 * Canvas LMS API Client
 *
 * A lightweight wrapper around the Canvas REST API.
 * Handles authentication, pagination, retries, and error cases (including 403s
 * from lecturer-restricted files) in one place so routes never deal with raw
 * fetch logic. Every request goes through safe-fetch's SSRF guard.
 *
 * Usage:
 *   const client = new CanvasClient(domain, userToken);
 *   const { data, forbidden, error } = await client.getCourses();
 */

import { safeCanvasFetch } from "./safe-fetch";
import { stripHtmlToText } from "./content-formatting";

// transient errors worth retrying (network blips, server hiccups)
const RETRYABLE_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
  "CANVAS_REQUEST_TIMEOUT",
]);
const MAX_RETRIES = 3;
const MAX_PAGINATION_PAGES = 100;
const RETRY_BASE_MS = 1000;
const CANVAS_JSON_ACCEPT = "application/json+canvas-string-ids";
const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export type CanvasId = string | number;
type CanvasJsonValue =
  | null
  | boolean
  | number
  | string
  | CanvasJsonValue[]
  | { [key: string]: CanvasJsonValue };

export interface CanvasRecord {
  [key: string]: unknown;
}

export interface CanvasCourse extends CanvasRecord {
  id: CanvasId;
  name?: string;
  course_code?: string;
  term?: { id?: CanvasId; name?: string } | null;
}

export interface CanvasFile extends CanvasRecord {
  id: CanvasId;
  display_name: string;
  filename?: string;
  "content-type"?: unknown;
  content_type?: string;
  url?: string;
  locked_for_user?: boolean;
  hidden_for_user?: boolean;
  lock_explanation?: string;
}

interface CanvasSubmission extends CanvasRecord {
  workflow_state?: string;
  submitted_at?: string | null;
  score?: number | null;
  attachments?: CanvasFile[];
}

export interface CanvasAssignment extends CanvasRecord {
  id: CanvasId;
  name: string;
  description?: string | null;
  due_at?: string | null;
  points_possible?: number | null;
  locked_for_user?: boolean;
  published?: boolean;
  is_quiz_assignment?: boolean;
  submission_types?: string[];
  attachments?: CanvasFile[];
  submission?: CanvasSubmission | null;
}

interface CanvasModule extends CanvasRecord {
  id: CanvasId;
  name: string;
}

export interface CanvasModuleItem extends CanvasRecord {
  id: CanvasId;
  title: string;
  type?: string;
  content_id?: CanvasId;
}

interface CanvasApiResult<T> {
  data: T | null;
  forbidden: boolean;
  unauthorized?: boolean;
  error?: string;
}

interface CanvasPaginatedResult<T> {
  data: T[];
  forbidden: boolean;
  unauthorized?: boolean;
  error?: string;
}

function isRecord(value: unknown): value is CanvasRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCanvasJsonValue(value: unknown): value is CanvasJsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isCanvasJsonValue);
  return isRecord(value) && Object.values(value).every(isCanvasJsonValue);
}

function isCanvasId(value: unknown): value is CanvasId {
  return typeof value === "string" || typeof value === "number";
}

function isCanvasCourse(value: unknown): value is CanvasCourse {
  return isRecord(value) && isCanvasId(value.id);
}

function isCanvasFile(value: unknown): value is CanvasFile {
  return isRecord(value) && isCanvasId(value.id);
}

function normalizeCanvasFile(file: CanvasFile): CanvasFile {
  // Canvas File responses use a hyphen; import consumers use content_type.
  const mimeType = file["content-type"];
  return typeof mimeType === "string" && mimeType.trim()
    ? { ...file, content_type: mimeType.trim() }
    : file;
}

function normalizeCanvasAssignmentFiles(
  assignment: CanvasAssignment,
): CanvasAssignment {
  let normalized = assignment;

  if (assignment.attachments) {
    normalized = {
      ...normalized,
      attachments: assignment.attachments.map(normalizeCanvasFile),
    };
  }

  if (assignment.submission?.attachments) {
    normalized = {
      ...normalized,
      submission: {
        ...assignment.submission,
        attachments: assignment.submission.attachments.map(normalizeCanvasFile),
      },
    };
  }

  return normalized;
}

function isCanvasSubmission(value: unknown): value is CanvasSubmission {
  return (
    isRecord(value) &&
    (value.attachments === undefined ||
      (Array.isArray(value.attachments) && value.attachments.every(isCanvasFile)))
  );
}

function isCanvasAssignment(value: unknown): value is CanvasAssignment {
  return (
    isRecord(value) &&
    isCanvasId(value.id) &&
    typeof value.name === "string" &&
    (value.attachments === undefined ||
      (Array.isArray(value.attachments) && value.attachments.every(isCanvasFile))) &&
    (value.submission === undefined ||
      value.submission === null ||
      isCanvasSubmission(value.submission))
  );
}

function isCanvasModule(value: unknown): value is CanvasModule {
  return isRecord(value) && isCanvasId(value.id) && typeof value.name === "string";
}

function isCanvasModuleItem(value: unknown): value is CanvasModuleItem {
  return isRecord(value) && isCanvasId(value.id) && typeof value.title === "string";
}

function positiveByteLimit(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// Downloads are buffered before their S3 upload and extraction. Keep a hard
// bound here, before an untrusted Canvas response can exhaust worker memory.
export const MAX_CANVAS_FILE_BYTES = positiveByteLimit(
  "CANVAS_MAX_FILE_BYTES",
  250 * 1024 * 1024,
);

function errorCode(error: unknown): unknown {
  if (!isRecord(error)) return undefined;
  if (error.code !== undefined) return error.code;
  return isRecord(error.cause) ? error.cause.code : undefined;
}

function isRetryable(error: unknown) {
  const code = errorCode(error);
  return typeof code === "string" && RETRYABLE_CODES.has(code);
}

async function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(response: { headers: { get(name: string): string | null } }, attempt: number) {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter !== null) {
    const retryAfterSeconds = Number(retryAfter);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
      return Math.min(60_000, Math.round(retryAfterSeconds * 1_000));
    }
    // Retry-After may also be an HTTP date
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) {
      return Math.min(60_000, Math.max(0, retryAt - Date.now()));
    }
  }
  return RETRY_BASE_MS * 2 ** attempt;
}

async function discardResponse(response: { body?: { cancel(): Promise<void> } | null }) {
  await response.body?.cancel().catch(() => undefined);
}

function isRateLimitedResponse(response: {
  status: number;
  headers: { get(name: string): string | null };
}) {
  if (response?.status === 429) return true;
  if (response?.status !== 403) return false;

  const remaining = Number.parseFloat(
    response.headers.get("x-rate-limit-remaining") ?? "",
  );
  return Number.isFinite(remaining) && remaining <= 0;
}

function nextPageUrl(linkHeader: string | null) {
  if (!linkHeader) return null;
  // Treat Canvas pagination URLs as opaque. Link relation parameters are not
  // guaranteed to be the first parameter, so do not rely on one header shape.
  for (const entry of linkHeader.split(/,(?=\s*<)/)) {
    const url = entry.match(/<([^>]+)>/)?.[1];
    if (url && /(?:^|;)\s*rel\s*=\s*"?next"?(?:\s*;|\s*$)/i.test(entry)) {
      return url;
    }
  }
  return null;
}

function validatedNextPageUrl(linkHeader: string | null, baseUrl: string): {
  url?: string | null;
  error?: string;
} {
  const nextUrl = nextPageUrl(linkHeader);
  if (!nextUrl) return { url: null };

  try {
    const parsedNextUrl = new URL(nextUrl);
    if (parsedNextUrl.origin !== new URL(baseUrl).origin) {
      return { error: "Canvas API returned an unsafe pagination URL" };
    }
    return { url: parsedNextUrl.href };
  } catch {
    return { error: "Canvas API returned an invalid pagination URL" };
  }
}

interface CanvasJsonPage {
  ok: true;
  body: unknown;
  link: string | null;
}

interface CanvasFailure {
  ok: false;
  forbidden: boolean;
  unauthorized?: true;
  error: string;
}

function failure(error: string): CanvasFailure {
  return { ok: false, forbidden: false, error };
}

function failureFields({ forbidden, unauthorized, error }: CanvasFailure) {
  return unauthorized ? { forbidden, unauthorized, error } : { forbidden, error };
}

// Pause if the Canvas X-Rate-Limit-Remaining header shows that the quota is low.
async function respectRateLimit(response: { headers: { get(name: string): string | null } }) {
  const remaining = response.headers.get("x-rate-limit-remaining");
  if (remaining !== null && parseFloat(remaining) < 10) {
    await sleep(1000);
  }
}

export class CanvasClient {
  readonly baseUrl: string;
  readonly token: string;

  constructor(domain: string, token: string) {
    this.baseUrl = `https://${domain}/api/v1`;
    this.token = token;
  }

  /**
   * Fetch one Canvas API URL as JSON, retrying transient failures. Get and
   * paginated reads share this so status handling cannot drift between them.
   */
  async #fetchJson(url: string): Promise<CanvasJsonPage | CanvasFailure> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await safeCanvasFetch(url, {
          Authorization: `Bearer ${this.token}`,
          Accept: CANVAS_JSON_ACCEPT,
        });

        if (isRateLimitedResponse(response)) {
          await discardResponse(response);
          if (attempt < MAX_RETRIES) {
            await sleep(retryDelayMs(response, attempt));
            continue;
          }
          return failure("Canvas API rate limited — try again later");
        }

        // respect Canvas rate limit headers — back off when close to limit
        await respectRateLimit(response);

        if (response.status === 403) {
          await discardResponse(response);
          return { ok: false, forbidden: true, error: "Access restricted by lecturer" };
        }

        if (response.status === 401) {
          await discardResponse(response);
          return {
            ok: false,
            forbidden: false,
            unauthorized: true,
            error: "Invalid or expired Canvas token",
          };
        }

        if (RETRYABLE_HTTP_STATUSES.has(response.status) && attempt < MAX_RETRIES) {
          await discardResponse(response);
          await sleep(retryDelayMs(response, attempt));
          continue;
        }

        if (!response.ok) {
          await discardResponse(response);
          return failure(`Canvas API error: ${response.status}`);
        }

        const body: unknown = await response.json();
        return { ok: true, body, link: response.headers.get("Link") };
      } catch (err) {
        if (attempt < MAX_RETRIES && isRetryable(err)) {
          await sleep(RETRY_BASE_MS * 2 ** attempt);
          continue;
        }
        return failure(err instanceof Error ? err.message : "Unknown error");
      }
    }
    return failure("Canvas request exhausted retries");
  }

  /** Make one authenticated request and validate the provider JSON boundary. */
  async #get<T>(path: string, isExpected: (value: unknown) => value is T): Promise<CanvasApiResult<T>> {
    const page = await this.#fetchJson(`${this.baseUrl}${path}`);
    if (!page.ok) return { data: null, ...failureFields(page) };
    if (!isExpected(page.body)) {
      return {
        data: null,
        forbidden: false,
        error: "Canvas API returned an unexpected response shape",
      };
    }
    return { data: page.body, forbidden: false };
  }

  /**
   * Fetch every page and validate each provider item before returning it. On
   * failure the items read so far come back with `error` set, so callers must
   * treat `data` as incomplete whenever `error` or `forbidden` is present.
   */
  async #getPaginated<T>(
    path: string,
    isExpected: (value: unknown) => value is T,
  ): Promise<CanvasPaginatedResult<T>> {
    const results: T[] = [];
    const visitedPages = new Set<string>();

    // Append per_page to the initial URL — Canvas default is 10 which is too slow
    let url: string | null = `${this.baseUrl}${path}${path.includes("?") ? "&" : "?"}per_page=100`;

    while (url) {
      if (visitedPages.has(url)) {
        return { data: results, forbidden: false, error: "Canvas API pagination loop detected" };
      }
      if (visitedPages.size >= MAX_PAGINATION_PAGES) {
        return { data: results, forbidden: false, error: "Canvas API pagination exceeded 100 pages" };
      }
      visitedPages.add(url);

      const page = await this.#fetchJson(url);
      if (!page.ok) return { data: results, ...failureFields(page) };
      if (!Array.isArray(page.body) || !page.body.every(isExpected)) {
        return {
          data: results,
          forbidden: false,
          error: "Canvas API returned a non-array paginated response",
        };
      }
      results.push(...page.body);

      const nextPage = validatedNextPageUrl(page.link, this.baseUrl);
      if (nextPage.error) {
        return { data: results, forbidden: false, error: nextPage.error };
      }
      url = nextPage.url ?? null;
    }

    return { data: results, forbidden: false };
  }

  /**
   * Returns all active courses the user is enrolled in.
   * include[]=term pulls in the enrollment term so we can extract the academic year.
   *
   * NOTE: enrollment_type=student is intentionally omitted — the parameter is
   * deprecated and some Canvas instances (including UoG) reject it with a 400.
   */
  async getCourses() {
    return this.#getPaginated(
      "/courses?enrollment_state=active&include[]=term",
      isCanvasCourse,
    );
  }

  /**
   * Returns every course that Canvas makes discoverable to the user, including
   * concluded enrollments. Canvas accepts one enrollment_state per request, so
   * fetch the supported states separately and de-duplicate course IDs.
   */
  async getDiscoverableCourses() {
    const courseStates = ["active", "invited_or_pending", "completed"];
    const coursesById = new Map<string, CanvasCourse>();

    for (const enrollmentState of courseStates) {
      const result = await this.#getPaginated(
        `/courses?enrollment_state=${enrollmentState}&include[]=term&include[]=concluded`,
        isCanvasCourse,
      );
      if (result.forbidden || result.error) {
        return result;
      }

      for (const course of result.data) {
        if (course?.id !== undefined && course?.id !== null) {
          coursesById.set(String(course.id), course);
        }
      }
    }

    return { data: [...coursesById.values()], forbidden: false };
  }

  /**
   * Returns the current user's enrollment records across current, future,
   * concluded, and restricted courses. Course-list visibility is not a
   * complete source of truth for historical enrolments, so callers use these
   * course IDs to resolve any missing course metadata directly.
   *
   * Canvas supports current_and_future only on a user's enrollments. Combining
   * it with completed and inactive returns the non-deleted enrollment ledger,
   * including effective future and soft-concluded records.
   */
  async getSelfEnrollments() {
    return this.#getPaginated(
      "/users/self/enrollments?state[]=current_and_future&state[]=completed&state[]=inactive",
      isRecord,
    );
  }

  /**
   * Returns full metadata for a single course.
   */
  async getCourse(courseId: string) {
    return this.#get(
      `/courses/${encodeURIComponent(courseId)}?include[]=term&include[]=concluded`,
      isCanvasCourse,
    );
  }

  /**
   * Returns the course syllabus and home page as plain text, for study map outlines.
   * Either is null when the course does not use it or the lecturer restricts it.
   */
  async getCourseOutline(courseId: string) {
    const [course, front] = await Promise.all([
      this.#get(`/courses/${encodeURIComponent(courseId)}?include[]=syllabus_body`, isRecord),
      this.#get(`/courses/${encodeURIComponent(courseId)}/front_page`, isRecord),
    ]);
    const text = (value: unknown) =>
      typeof value === "string" && value.trim() ? stripHtmlToText(value) : null;
    return {
      syllabus: text(course.data?.syllabus_body),
      frontPage: text(front.data?.body),
    };
  }

  /**
   * Returns one assignment. include[]=submission pulls in the student's own
   * submission attachments.
   */
  async getAssignment(courseId: string, assignmentId: string) {
    const result = await this.#get(
      `/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(assignmentId)}?include[]=submission`,
      isCanvasAssignment,
    );
    return {
      ...result,
      data: result.data ? normalizeCanvasAssignmentFiles(result.data) : null,
    };
  }

  /** Returns all assignments for a course, with the same submission include. */
  async getAssignments(courseId: string) {
    const result = await this.#getPaginated(
      `/courses/${encodeURIComponent(courseId)}/assignments?include[]=submission`,
      isCanvasAssignment,
    );
    return {
      ...result,
      data: result.data.map(normalizeCanvasAssignmentFiles),
    };
  }

  /**
   * Returns bounded Canvas planner items for the user.
   */
  async getPlannerItems(startDate: string, endDate: string) {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
    });
    return this.#getPaginated(`/planner/items?${params.toString()}`, isRecord);
  }

  /**
   * Returns all discussion topics for a course.
   */
  async getDiscussionTopics(courseId: string) {
    return this.#getPaginated(`/courses/${encodeURIComponent(courseId)}/discussion_topics`, isRecord);
  }

  /**
   * Returns Canvas announcements, which are exposed as discussion topics.
   */
  async getAnnouncements(courseId: string) {
    return this.#getPaginated(
      `/courses/${encodeURIComponent(courseId)}/discussion_topics?only_announcements=true`,
      isRecord,
    );
  }

  /**
   * Returns all modules inside a course.
   * Modules are the folder-like containers Canvas uses to organise content.
   */
  async getModules(courseId: string) {
    return this.#getPaginated(`/courses/${encodeURIComponent(courseId)}/modules`, isCanvasModule);
  }

  /**
   * Returns all items inside a specific module.
   * Items can be Files, Pages, Assignments, Quizzes, etc.
   * The import pipeline filters these down to File type only.
   */
  async getModuleItems(courseId: string, moduleId: CanvasId) {
    return this.#getPaginated(
      `/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(String(moduleId))}/items`,
      isCanvasModuleItem,
    );
  }

  /**
   * Returns the course's flat Files inventory. This includes files that are
   * not placed in a module or attached to an assignment.
   */
  async getCourseFiles(courseId: string) {
    const result = await this.#getPaginated(
      `/courses/${encodeURIComponent(courseId)}/files`,
      isCanvasFile,
    );
    return { ...result, data: result.data.map(normalizeCanvasFile) };
  }

  /**
   * Returns full metadata for a single file, including its download URL and MIME type. Called once per file item found in a module.
   */
  async getFile(courseId: string, fileId: CanvasId) {
    const result = await this.#get(
      `/courses/${encodeURIComponent(courseId)}/files/${encodeURIComponent(String(fileId))}`,
      isCanvasFile,
    );
    return {
      ...result,
      data: result.data ? normalizeCanvasFile(result.data) : null,
    };
  }

  /**
   * Generic read-only Canvas API helper for export/archive code.
   */
  async getPath(path: string) {
    return this.#get(path, isCanvasJsonValue);
  }

  /**
   * Generic paginated read-only Canvas API helper for export/archive code.
   */
  async getPaginatedPath(path: string) {
    return this.#getPaginated(path, isRecord);
  }

  /**
   * Downloads a file's binary content from Canvas.
   * The URL comes from the file metadata returned by getFile().
   * Returns a Node.js Buffer ready to pass to S3. The token is only sent when
   * the URL is on the Canvas origin; safe-fetch strips it on cross-origin
   * redirects.
   */
  async downloadFile(url: string) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const headers: Record<string, string> = new URL(url).origin === new URL(this.baseUrl).origin
          ? { Authorization: `Bearer ${this.token}` }
          : {};
        const response = await safeCanvasFetch(url, headers, true);

        if (isRateLimitedResponse(response)) {
          await discardResponse(response);
          if (attempt < MAX_RETRIES) {
            await sleep(retryDelayMs(response, attempt));
            continue;
          }
          return {
            buffer: null,
            forbidden: false,
            error: "Download rate limited",
          };
        }

        if (response.status === 403) {
          await discardResponse(response);
          return {
            buffer: null,
            forbidden: true,
            error: "File download restricted",
          };
        }

        if (RETRYABLE_HTTP_STATUSES.has(response.status) && attempt < MAX_RETRIES) {
          await discardResponse(response);
          await sleep(retryDelayMs(response, attempt));
          continue;
        }

        if (!response.ok) {
          await discardResponse(response);
          return {
            buffer: null,
            forbidden: false,
            error: `Download failed: ${response.status}`,
          };
        }

        const declaredLength = Number(response.headers.get("content-length"));
        if (
          Number.isFinite(declaredLength) &&
          declaredLength > MAX_CANVAS_FILE_BYTES
        ) {
          await discardResponse(response);
          return {
            buffer: null,
            forbidden: false,
            error: `Canvas file exceeds CANVAS_MAX_FILE_BYTES (${MAX_CANVAS_FILE_BYTES} bytes)`,
          };
        }

        if (!response.body) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          if (buffer.length > MAX_CANVAS_FILE_BYTES) {
            return {
              buffer: null,
              forbidden: false,
              error: `Canvas file exceeds CANVAS_MAX_FILE_BYTES (${MAX_CANVAS_FILE_BYTES} bytes)`,
            };
          }
          return { buffer, forbidden: false };
        }

        const reader = response.body.getReader();
        const chunks: Buffer[] = [];
        let bytesRead = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = Buffer.from(value);
            bytesRead += chunk.length;
            if (bytesRead > MAX_CANVAS_FILE_BYTES) {
              await reader.cancel().catch(() => undefined);
              return {
                buffer: null,
                forbidden: false,
                error: `Canvas file exceeds CANVAS_MAX_FILE_BYTES (${MAX_CANVAS_FILE_BYTES} bytes)`,
              };
            }
            chunks.push(chunk);
          }
        } finally {
          reader.releaseLock();
        }
        return { buffer: Buffer.concat(chunks, bytesRead), forbidden: false };
      } catch (err) {
        if (attempt < MAX_RETRIES && isRetryable(err)) {
          await sleep(RETRY_BASE_MS * 2 ** attempt);
          continue;
        }
        return {
          buffer: null,
          forbidden: false,
          error: err instanceof Error ? err.message : "Download error",
        };
      }
    }
    return { buffer: null, forbidden: false, error: "Download exhausted retries" };
  }
}
