import { CanvasTrashConflictError, findCanvasTrashConflicts } from "./trash-conflicts";
import { createHash } from "node:crypto";
import type postgres from "postgres";
import sql from "@/database/pgsql";
import { normalizeCanvasCourseSelection, type CanvasCourseSelection } from "./id";
import { cancelActiveCanvasImportJobs } from "./cancel-import-jobs";

export class CanvasRetryUnavailableError extends Error {}

export interface CanvasRun {
  id: string;
  status: string;
  course_ids: unknown;
  job_type: string | null;
  request_fingerprint: string | null;
}

export type StartCanvasRunResult =
  | { kind: "created" | "existing"; jobId: string }
  | { kind: "conflict"; activeJob: { jobId: string; status: string } | null };

export function canonicalCanvasCourses(values: unknown[]): CanvasCourseSelection[] {
  const courses = new Map<string, CanvasCourseSelection>();
  for (const value of values) {
    const course = normalizeCanvasCourseSelection(value);
    const existing = courses.get(course.id);
    courses.set(course.id, existing ? {
      id: course.id,
      name: existing.name === existing.id ? course.name : existing.name,
      course_code: existing.course_code || course.course_code,
      term: existing.term ?? course.term,
    } : course);
  }
  return [...courses.values()].sort((a, b) =>
    a.id.length - b.id.length || a.id.localeCompare(b.id));
}

export function canvasRequestFingerprint(
  courses: CanvasCourseSelection[], mode: string,
): string {
  return createHash("sha256")
    .update(JSON.stringify([mode, canonicalCanvasCourses(courses).map(({ id }) => id)]))
    .digest("hex");
}

export async function lockCanvasRuns(tx: postgres.TransactionSql, userId: string) {
  await tx`SELECT pg_advisory_xact_lock(hashtext(${`oghma-canvas-import:${userId}`}))`;
}

export async function activeCanvasRun(tx: postgres.TransactionSql, userId: string) {
  const [active] = await tx<CanvasRun[]>`
    SELECT id, status, course_ids, job_type, request_fingerprint
    FROM app.canvas_import_jobs
    WHERE user_id = ${userId}::uuid AND type = 'canvas'
      AND status IN ('queued', 'discovering', 'processing')
    ORDER BY created_at DESC LIMIT 1
  `;
  return active ?? null;
}

export async function startCanvasRun(params: {
  userId: string;
  courses: CanvasCourseSelection[];
  mode: "import" | "sync" | "retry";
  sourceJobId?: string;
  expectedActiveJobId?: string;
  checkTrash?: boolean;
}): Promise<StartCanvasRunResult> {
  const courses = canonicalCanvasCourses(params.courses);
  const fingerprint = canvasRequestFingerprint(courses,
    params.mode === "retry" ? `retry:${params.sourceJobId}` : params.mode);
  return sql.begin(async (tx) => {
    await lockCanvasRuns(tx, params.userId);
    const active = await activeCanvasRun(tx, params.userId);
    // Older jobs predate fingerprints. Compare their canonical intent too.
    const oldCourses: unknown = typeof active?.course_ids === "string"
      ? JSON.parse(active.course_ids) : active?.course_ids;
    const activeFingerprint = active?.request_fingerprint ??
      (Array.isArray(oldCourses)
        ? canvasRequestFingerprint(canonicalCanvasCourses(oldCourses), active?.job_type === "sync" ? "sync" : "import")
        : null);
    if (active && activeFingerprint === fingerprint) {
      return { kind: "existing", jobId: active.id };
    }
    if (active?.id !== params.expectedActiveJobId && (active || params.expectedActiveJobId)) {
      return { kind: "conflict", activeJob: active ? { jobId: active.id, status: active.status } : null };
    }
    if (params.mode === "import" && params.checkTrash) {
      const folders = await findCanvasTrashConflicts(params.userId, courses.map((course) => course.id), tx);
      if (folders.length) throw new CanvasTrashConflictError(folders);
    }
    if (params.mode === "retry") {
      const [source] = await tx`
        SELECT id FROM app.canvas_import_jobs WHERE id = ${params.sourceJobId ?? null}::uuid
          AND user_id = ${params.userId}::uuid AND type = 'canvas' AND status IN ('complete', 'failed')
        FOR UPDATE
      `;
      const [eligible] = await tx`
        SELECT id FROM app.canvas_imports WHERE job_id = ${params.sourceJobId ?? null}::uuid
          AND user_id = ${params.userId}::uuid AND status = 'error' AND retryable = TRUE LIMIT 1
      `;
      if (!source || !eligible) throw new CanvasRetryUnavailableError("No retryable files remain in this import");
    }
    if (active) await cancelActiveCanvasImportJobs(tx, params.userId, "Replaced by a newer Canvas import");
    const [job] = await tx<{ id: string }[]>`
      INSERT INTO app.canvas_import_jobs (user_id, course_ids, status, job_type, request_fingerprint, source_job_id)
      VALUES (${params.userId}::uuid, ${JSON.stringify(courses)}::text::jsonb,
        ${params.mode === "retry" ? "processing" : "queued"},
        ${params.mode}, ${fingerprint}, ${params.sourceJobId ?? null}::uuid) RETURNING id
    `;
    if (params.mode === "retry") {
      await tx`
        UPDATE app.canvas_import_jobs SET result_summary = (
          SELECT jsonb_build_object('imported', COUNT(*) FILTER (WHERE status = 'complete'),
            'failed', COUNT(*) FILTER (WHERE status = 'error'), 'restricted', COUNT(*) FILTER (WHERE status = 'forbidden'),
            'stopped', COUNT(*) FILTER (WHERE status = 'cancelled'))
          FROM app.canvas_imports WHERE job_id = ${params.sourceJobId ?? null}::uuid
        ) WHERE id = ${params.sourceJobId ?? null}::uuid AND result_summary IS NULL
      `;
      const moved = await tx`
        UPDATE app.canvas_imports SET job_id = ${job.id}::uuid, status = 'pending',
          claim_token = NULL, claim_expires_at = NULL, dispatched_at = NULL, next_attempt_at = NULL,
          execution_attempts = 0, retry_attempts = 0, retry_seq = retry_seq + 1,
          error_message = NULL, retryable = FALSE, updated_at = NOW()
        WHERE job_id = ${params.sourceJobId ?? null}::uuid AND user_id = ${params.userId}::uuid
          AND status = 'error' AND retryable = TRUE RETURNING id
      `;
      if (!moved.length) throw new CanvasRetryUnavailableError("No retryable files remain in this import");
      await tx`UPDATE app.imported_file_cache SET owner_job_id = ${job.id}::uuid
        WHERE owner_import_id = ANY(${moved.map((row) => row.id)}::uuid[])
          AND owner_job_id = ${params.sourceJobId ?? null}::uuid AND status <> 'ready'`;
      await tx`UPDATE app.canvas_import_jobs SET expected_total = ${moved.length} WHERE id = ${job.id}::uuid`;
    }
    return { kind: "created", jobId: job.id };
  });
}
