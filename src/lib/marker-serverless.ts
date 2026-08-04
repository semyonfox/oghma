import { randomUUID } from "node:crypto";

import sql from "@/database/pgsql";
import {
  enqueueMarkerCompletionJob,
  enqueueMarkerDispatchJob,
  enqueueMarkerFailureJob,
} from "@/lib/queue";
import type { ObjectMetadata } from "@/lib/storage/base";
import { getStorageProvider } from "@/lib/storage/init";
import type { StoreS3 } from "@/lib/storage/s3";
import {
  requestVastEndpoint,
  vastWorkloadCost,
  type VastRequestMetrics,
} from "@/lib/vast-serverless";

/** Only Vast is supported for new Marker++ jobs. */
export type MarkerServerlessProvider = "vast";
type StoredMarkerProvider = MarkerServerlessProvider | "runpod";

function positiveInt(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function enabled(value: string | undefined): boolean {
  return ["1", "true", "on", "yes"].includes(
    value?.trim().toLowerCase() ?? "",
  );
}

function dispatchEnabled(): boolean {
  // GPU dispatch must be explicitly enabled; a credential alone must never
  // turn a deployment into a paid external-processing path.
  return enabled(process.env.MARKER_SERVERLESS_DISPATCH_ENABLED);
}

function maxDispatchAttempts(): number {
  // An application-originated GPU call has an ambiguous external boundary:
  // after a timeout the worker may still be running. Do not make this an
  // operator-tunable retry count; the durable row gets exactly one Oghma
  // dispatch and then probes its immutable output object.
  return 1;
}

function resultGraceSeconds(): number {
  // An HTTP timeout is ambiguous: the GPU may still be converting and will
  // upload its stable result after the caller has given up. Favor one paid
  // execution over automatic redispatch; an absent result becomes an explicit
  // terminal failure after this observation window.
  return positiveInt("MARKER_RESULT_GRACE_SECONDS", 30 * 60);
}

function maxCompletionAttempts(): number {
  return positiveInt("MARKER_COMPLETION_MAX_ATTEMPTS", 3);
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/https?:\/\/\S+/gi, "[redacted-url]").slice(0, 1_000);
}

export function markerServerlessProvider(): MarkerServerlessProvider | null {
  const configured = process.env.MARKER_SERVERLESS_PROVIDER
    ?.trim()
    .toLowerCase();
  return configured === "vast" ? "vast" : null;
}

function vastConfigured(): boolean {
  return Boolean(
    process.env.VAST_MARKER_ENDPOINT_NAME?.trim() &&
      process.env.VAST_MARKER_ENDPOINT_API_KEY?.trim(),
  );
}

function hasSafePublicStorageEndpoint(): boolean {
  const value = process.env.STORAGE_PUBLIC_ENDPOINT?.trim();
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function markerQueueEnabled(): boolean {
  if (
    !enabled(process.env.MARKER_OCR_ENABLED) ||
    !dispatchEnabled() ||
    !hasSafePublicStorageEndpoint()
  ) {
    return false;
  }
  return markerServerlessProvider() === "vast" && vastConfigured();
}

export function processAllPdfsWithMarker(): boolean {
  return enabled(process.env.MARKER_PROCESS_ALL_PDFS);
}

export interface SubmitMarkerJobInput {
  sourceKey: string;
  sourceBytes?: number | null;
  noteId: string;
  userId: string;
  jobId?: string | null;
  filename: string;
  mimeType?: string | null;
  parentFolderId?: string | null;
}

export interface SubmittedMarkerJob {
  markerJobId: string;
  provider: MarkerServerlessProvider;
  resultKey: string;
}

/** Submission lost the Canvas cancellation race before any GPU work was sent. */
export class MarkerSubmissionCancelledError extends Error {
  constructor() {
    super("Canvas import is no longer active for Marker submission");
    this.name = "MarkerSubmissionCancelledError";
  }
}

export async function submitMarkerJob({
  sourceKey,
  sourceBytes,
  noteId,
  userId,
  jobId,
  filename,
  mimeType,
  parentFolderId,
}: SubmitMarkerJobInput): Promise<SubmittedMarkerJob> {
  const provider = markerServerlessProvider();
  if (provider !== "vast" || !markerQueueEnabled()) {
    throw new Error(
      "Marker serverless queue is incomplete; configure a provider, its endpoint credential, and STORAGE_PUBLIC_ENDPOINT",
    );
  }

  const marker = await sql.begin(async (tx: any) => {
    // Match the cancellation lock order: Canvas job -> Marker row -> Canvas
    // import. If cancellation commits first, this transaction observes it and
    // exits without creating paid work; if this commits first, cancellation
    // sees and cancels the newly durable Marker row.
    if (jobId) {
      const [activeJob] = await tx`
        SELECT id
        FROM app.canvas_import_jobs
        WHERE id = ${jobId}::uuid
          AND user_id = ${userId}::uuid
          AND type = 'canvas'
          AND status = 'processing'
        FOR UPDATE
      `;
      if (!activeJob) throw new MarkerSubmissionCancelledError();
    }

    const [activeMarker] = await tx`
      SELECT callback_id, provider, result_key, status
      FROM app.marker_jobs
      WHERE note_id = ${noteId}::uuid
        AND status NOT IN ('completed', 'failed', 'invalid_result', 'cancelled')
      FOR UPDATE
    `;
    if (activeMarker) {
      if (activeMarker.provider !== "vast") {
        throw new Error(
          "An unfinished legacy Marker job already owns this note; let it finish or cancel it before submitting a Vast job",
        );
      }
      return {
        callbackId: activeMarker.callback_id,
        provider: activeMarker.provider as MarkerServerlessProvider,
        resultKey: activeMarker.result_key,
        status: activeMarker.status,
        created: false,
      };
    }

    if (jobId) {
      const [activeImport] = await tx`
        SELECT id
        FROM app.canvas_imports
        WHERE note_id = ${noteId}::uuid
          AND user_id = ${userId}::uuid
          AND job_id = ${jobId}::uuid
          AND status IN ('downloading', 'processing', 'indexing', 'pending_marker')
        FOR UPDATE
      `;
      if (!activeImport) throw new MarkerSubmissionCancelledError();
    }

    const callbackId = randomUUID();
    const resultKey = `marker-results/${callbackId}.json`;
    const [inserted] = await tx`
      INSERT INTO app.marker_jobs (
        callback_id, provider, note_id, user_id, canvas_job_id, filename,
        mime_type, parent_folder_id, source_key, source_bytes, result_key, status
      ) VALUES (
        ${callbackId}::uuid, ${provider}, ${noteId}::uuid, ${userId}::uuid,
        ${jobId ?? null}::uuid, ${filename},
        ${mimeType ?? "application/octet-stream"},
        ${parentFolderId ?? null}::uuid, ${sourceKey},
        ${sourceBytes ?? null}, ${resultKey}, 'dispatch_queued'
      )
      ON CONFLICT (note_id)
        WHERE status NOT IN ('completed', 'failed', 'invalid_result', 'cancelled')
      DO NOTHING
      RETURNING callback_id, provider, result_key, status
    `;
    if (!inserted) {
      const [racedMarker] = await tx`
        SELECT callback_id, provider, result_key, status
        FROM app.marker_jobs
        WHERE note_id = ${noteId}::uuid
          AND status NOT IN ('completed', 'failed', 'invalid_result', 'cancelled')
        FOR UPDATE
      `;
      if (racedMarker) {
        if (racedMarker.provider !== "vast") {
          throw new Error(
            "An unfinished legacy Marker job already owns this note; let it finish or cancel it before submitting a Vast job",
          );
        }
        return {
          callbackId: racedMarker.callback_id,
          provider: racedMarker.provider as MarkerServerlessProvider,
          resultKey: racedMarker.result_key,
          status: racedMarker.status,
          created: false,
        };
      }
      throw new Error("Marker job insert was not retained");
    }

    // The durable state must commit before a queue consumer can submit GPU
    // work. This prevents a fast result from being overwritten as pending.
    await tx`
      UPDATE app.canvas_imports
      SET status = 'pending_marker', error_message = NULL, updated_at = NOW()
      WHERE note_id = ${noteId}::uuid
        AND user_id = ${userId}::uuid
        AND (${jobId ?? null}::uuid IS NULL OR job_id = ${jobId}::uuid)
        AND status IN ('downloading', 'processing', 'indexing', 'pending_marker')
    `;
    await tx`
      UPDATE app.ingestion_jobs
      SET status = 'pending', error = NULL, updated_at = NOW()
      WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
        AND status NOT IN ('done', 'cancelled')
    `;
    return {
      callbackId: inserted.callback_id,
      provider: inserted.provider as MarkerServerlessProvider,
      resultKey: inserted.result_key,
      status: inserted.status,
      created: true,
    };
  });

  if (
    marker.created ||
    ["dispatch_queued", "enqueue_failed", "dispatch_retry", "dispatch_paused"].includes(
      marker.status,
    )
  ) {
    try {
      await enqueueMarkerDispatchJob(marker.callbackId);
    } catch (error) {
      const message = errorMessage(error);
      await sql`
        UPDATE app.marker_jobs
        SET status = 'enqueue_failed', error = ${message}, updated_at = NOW()
        WHERE callback_id = ${marker.callbackId}::uuid
          AND status IN ('dispatch_queued', 'enqueue_failed')
      `;
      // The database poller will recover enqueue_failed jobs. Do not fall
      // back to a generic extraction retry after the Marker state is durable.
    }
  }

  return {
    markerJobId: marker.callbackId,
    provider: marker.provider,
    resultKey: marker.resultKey,
  };
}

interface MarkerJobRow {
  callback_id: string;
  provider: StoredMarkerProvider;
  provider_job_id: string | null;
  runpod_job_id: string | null;
  note_id: string;
  user_id: string;
  canvas_job_id: string | null;
  parent_folder_id: string | null;
  filename: string;
  mime_type: string;
  source_key: string;
  source_bytes: number | string | null;
  result_key: string;
  status: string;
  error: string | null;
  dispatch_attempts: number;
  completion_attempts: number;
  updated_at: string | Date;
}

async function markResultReady(
  job: MarkerJobRow,
  providerJobId: string | null,
  metrics: VastRequestMetrics | null,
): Promise<boolean> {
  const rows = await sql`
    UPDATE app.marker_jobs
    SET status = 'completion_queued',
        provider_job_id = COALESCE(${providerJobId}, provider_job_id),
        provider_metrics = COALESCE(
          ${metrics ? JSON.stringify(metrics) : null}::jsonb,
          provider_metrics
        ),
        completion_enqueued_at = NOW(),
        error = NULL,
        updated_at = NOW()
    WHERE callback_id = ${job.callback_id}::uuid
      AND status IN ('dispatching', 'awaiting_result')
      AND dispatch_attempts = ${job.dispatch_attempts}
    RETURNING callback_id
  `;
  // Cancellation can race an already-running external GPU request. The result
  // may still land in object storage, but never resurrect a cancelled import.
  if (rows.length === 0) return false;
  await enqueueMarkerCompletionJob(job.callback_id);
  return true;
}

// The result object is already durable at this point, so a failure to hand the
// job to the canvas queue must stay retryable rather than fail the conversion.
async function completeWithResult(
  job: MarkerJobRow,
  providerJobId: string | null,
  metrics: VastRequestMetrics | null,
): Promise<void> {
  try {
    await markResultReady(job, providerJobId, metrics);
  } catch (error) {
    await sql`
      UPDATE app.marker_jobs
      SET status = 'completion_enqueue_failed', error = ${errorMessage(error)}, updated_at = NOW()
      WHERE callback_id = ${job.callback_id}::uuid
        AND status = 'completion_queued'
        AND dispatch_attempts = ${job.dispatch_attempts}
    `;
    throw error;
  }
}

function markerOptions(): Record<string, unknown> {
  return {
    outputFormat: "markdown",
    mode: process.env.MARKER_MODE ?? "balanced",
    pageRange: process.env.MARKER_PAGE_RANGE?.trim() || null,
    ocrFallbackPolicy: process.env.MARKER_OCR_FALLBACK_POLICY ?? "auto",
    tableOcrPolicy: process.env.MARKER_TABLE_OCR_POLICY ?? "auto",
    useLlm: enabled(process.env.MARKER_USE_LLM),
  };
}

interface ProviderResult {
  providerJobId: string | null;
  metrics: VastRequestMetrics;
}

async function dispatchVast(
  storage: StoreS3,
  job: MarkerJobRow,
): Promise<ProviderResult> {
  const ttlSeconds = positiveInt("MARKER_SERVERLESS_URL_TTL_SECONDS", 3_600);
  const [sourceUrl, resultUrl] = await Promise.all([
    storage.getExternalSignUrl(job.source_key, ttlSeconds),
    // Immutable result writes prevent a late/duplicate worker from replacing
    // the envelope that is bound to this callback ID.
    storage.getPutSignUrl(job.result_key, ttlSeconds, "application/json", true),
  ]);
  const sourceBytes =
    job.source_bytes === null ? null : Number(job.source_bytes);
  const result = await requestVastEndpoint<{
    success?: boolean;
    requestId?: string;
    resultKey?: string;
    error?: string;
  }>(
    "/marker/job",
    {
      requestId: job.callback_id,
      sourceUrl,
      resultUrl,
      resultKey: job.result_key,
      sourceBytes,
      // Marker only needs the extension. Do not disclose a user-controlled
      // filename to the third-party worker.
      filename: "document.pdf",
      options: markerOptions(),
    },
    vastWorkloadCost(sourceBytes),
    {
      endpointName: process.env.VAST_MARKER_ENDPOINT_NAME!.trim(),
      endpointApiKey: process.env.VAST_MARKER_ENDPOINT_API_KEY!.trim(),
      totalTimeoutMs: positiveInt(
        "VAST_MARKER_TOTAL_TIMEOUT_MS",
        20 * 60 * 1_000,
      ),
      workerTimeoutMs: positiveInt(
        "VAST_MARKER_WORKER_TIMEOUT_MS",
        15 * 60 * 1_000,
      ),
      // A lost response is an unknown paid outcome. Never retry a worker call
      // inside the provider client; recovery observes the stable result object
      // instead of issuing another conversion.
      maxWorkerAttempts: 1,
      maxPollIntervalMs: positiveInt(
        "VAST_MARKER_MAX_POLL_INTERVAL_MS",
        5_000,
      ),
    },
  );
  if (result.response.success !== true) {
    throw new Error(
      `Vast Marker worker rejected the job: ${result.response.error ?? "unknown error"}`,
    );
  }
  if (
    result.response.resultKey &&
    result.response.resultKey !== job.result_key
  ) {
    throw new Error("Vast Marker worker returned a mismatched result key");
  }
  if (result.response.requestId && result.response.requestId !== job.callback_id) {
    throw new Error("Vast Marker worker returned a mismatched request ID");
  }
  if ((await storage.getObjectMeta(job.result_key)) === undefined) {
    throw new Error("Vast Marker worker returned before its result was durable");
  }

  return {
    // Vast request_idx is a router correlation value, not a durable provider
    // job ID. Keep it only in provider_metrics.
    providerJobId: job.provider_job_id,
    metrics: result.metrics,
  };
}

async function dispatchToProvider(
  storage: StoreS3,
  job: MarkerJobRow,
): Promise<ProviderResult> {
  if (job.provider !== "vast") {
    throw new Error(`Retired Marker provider: ${job.provider}`);
  }
  if (!vastConfigured()) throw new Error("Vast Marker is not configured");
  return await dispatchVast(storage, job);
}

async function recordAmbiguousDispatchOutcome(
  job: MarkerJobRow,
  error: unknown,
): Promise<void> {
  const message = errorMessage(error);
  const rows = await sql`
    UPDATE app.marker_jobs
    SET status = 'awaiting_result', error = ${message}, updated_at = NOW()
    WHERE callback_id = ${job.callback_id}::uuid
      AND status = 'dispatching'
      AND dispatch_attempts = ${job.dispatch_attempts}
    RETURNING callback_id
  `;
  if (rows.length === 0) return;
}

async function recordTerminalDispatchFailure(
  job: MarkerJobRow,
  message: string,
): Promise<void> {
  const rows = await sql`
    UPDATE app.marker_jobs
    SET status = 'failure_queued', error = ${message}, updated_at = NOW()
    WHERE callback_id = ${job.callback_id}::uuid
      AND status IN ('dispatching', 'dispatch_retry', 'awaiting_result')
      AND dispatch_attempts = ${job.dispatch_attempts}
    RETURNING callback_id
  `;
  if (rows.length === 0) return;
  try {
    await enqueueMarkerFailureJob(job.callback_id);
  } catch (error) {
    await sql`
      UPDATE app.marker_jobs
      SET status = 'failure_enqueue_failed', error = ${message}, updated_at = NOW()
      WHERE callback_id = ${job.callback_id}::uuid
        AND status = 'failure_queued'
        AND dispatch_attempts = ${job.dispatch_attempts}
    `;
    // Leave a non-terminal state for the database recovery loop.
    throw new Error(
      `Marker failure notification enqueue failed: ${errorMessage(error)}`,
    );
  }
}

export async function dispatchMarkerJob(callbackId: string): Promise<void> {
  const [existing] = (await sql`
    SELECT * FROM app.marker_jobs
    WHERE callback_id = ${callbackId}::uuid
    LIMIT 1
  `) as MarkerJobRow[];
  // A note deletion cascades its Marker row. A delayed at-least-once queue
  // delivery for that row is already complete and should be acknowledged.
  if (!existing) return;
  if (
    ["completed", "failed", "invalid_result", "cancelled"].includes(
      existing.status,
    )
  ) {
    return;
  }
  // A lost/ambiguous response may still correspond to an active GPU worker.
  // Poll only the immutable result object during the grace window; never send
  // a second paid conversion for this durable callback ID.
  if (existing.status === "awaiting_result") {
    const storage = getStorageProvider();
    let result:
      | Pick<ObjectMetadata, "meta" | "contentType" | "contentLength">
      | undefined;
    try {
      result = await storage.getObjectMeta(existing.result_key);
    } catch (error) {
      console.warn(
        `Marker result probe failed for ${callbackId}: ${errorMessage(error)}`,
      );
      return;
    }
    if (result !== undefined) {
      await completeWithResult(existing, existing.provider_job_id, null);
      return;
    }
    const updatedAt = new Date(existing.updated_at).getTime();
    if (
      Number.isFinite(updatedAt) &&
      Date.now() - updatedAt >= resultGraceSeconds() * 1_000
    ) {
      await recordTerminalDispatchFailure(
        existing,
        existing.error ??
          `Marker result was not observed within ${resultGraceSeconds()} seconds`,
      );
    }
    return;
  }

  // Legacy automatic-retry rows are ambiguous too. Convert them to the safe
  // observation state rather than issuing a second GPU call after an upgrade.
  if (existing.status === "dispatch_retry") {
    await sql`
      UPDATE app.marker_jobs
      SET status = 'awaiting_result', updated_at = NOW()
      WHERE callback_id = ${callbackId}::uuid
        AND status = 'dispatch_retry'
        AND dispatch_attempts = ${existing.dispatch_attempts}
    `;
    return;
  }
  if (!dispatchEnabled()) {
    await sql`
      UPDATE app.marker_jobs
      SET status = 'dispatch_paused', updated_at = NOW()
      WHERE callback_id = ${callbackId}::uuid
        AND status IN ('dispatch_queued', 'dispatch_paused', 'enqueue_failed', 'recovering')
    `;
    return;
  }

  const storage = getStorageProvider();

  const maxAttempts = maxDispatchAttempts();
  const [job] = (await sql`
    UPDATE app.marker_jobs
    SET status = 'dispatching',
        dispatch_attempts = CASE
          WHEN dispatch_attempts < ${maxAttempts}
            THEN dispatch_attempts + 1
          ELSE dispatch_attempts
        END,
        started_at = COALESCE(started_at, NOW()),
        updated_at = NOW()
    WHERE callback_id = ${callbackId}::uuid
      AND status IN (
        'dispatch_queued', 'dispatch_paused',
        'enqueue_failed', 'recovering'
      )
    RETURNING *
  `) as MarkerJobRow[];
  if (!job) return;

  // A previous attempt may already have paid for the conversion, so always
  // prefer an existing result object over dispatching again.
  let result:
    | Pick<ObjectMetadata, "meta" | "contentType" | "contentLength">
    | undefined;
  try {
    result = await storage.getObjectMeta(job.result_key);
  } catch (error) {
    await recordAmbiguousDispatchOutcome(job, error);
    return;
  }
  if (result !== undefined) {
    await completeWithResult(job, job.provider_job_id, null);
    return;
  }

  // `existing` holds the pre-claim count, so the cap is checked against
  // attempts that already ran rather than the one just claimed.
  if (existing.dispatch_attempts >= maxAttempts) {
    await recordTerminalDispatchFailure(
      job,
      job.error ?? `Marker dispatch exhausted ${maxAttempts} attempt(s)`,
    );
    return;
  }

  let dispatched: ProviderResult;
  try {
    const [stillOwned] = await sql`
      SELECT callback_id
      FROM app.marker_jobs
      WHERE callback_id = ${job.callback_id}::uuid
        AND status = 'dispatching'
        AND dispatch_attempts = ${job.dispatch_attempts}
    `;
    if (!stillOwned) return;
    dispatched = await dispatchToProvider(storage, job);
  } catch (error) {
    await recordAmbiguousDispatchOutcome(job, error);
    return;
  }

  await completeWithResult(
    job,
    dispatched.providerJobId,
    dispatched.metrics,
  );
}

export async function recoverMarkerDispatchJobs(limit = 50): Promise<number> {
  if (!dispatchEnabled()) return 0;
  const completionLimit = maxCompletionAttempts();
  const dispatchRows = (await sql`
    WITH candidates AS (
      SELECT callback_id
      FROM app.marker_jobs
      WHERE status IN (
        'dispatch_queued', 'dispatch_paused', 'enqueue_failed', 'recovering'
      )
        AND updated_at < NOW() - INTERVAL '15 seconds'
      ORDER BY updated_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE app.marker_jobs jobs
    SET status = 'recovering', updated_at = NOW()
    FROM candidates
    WHERE jobs.callback_id = candidates.callback_id
    RETURNING jobs.callback_id
  `) as { callback_id: string }[];

  for (const row of dispatchRows) {
    try {
      await enqueueMarkerDispatchJob(row.callback_id);
      await sql`
        UPDATE app.marker_jobs
        SET status = 'dispatch_queued', updated_at = NOW()
        WHERE callback_id = ${row.callback_id}::uuid
          AND status = 'recovering'
      `;
    } catch (error) {
      await sql`
        UPDATE app.marker_jobs
        SET status = 'enqueue_failed', error = ${errorMessage(error)}, updated_at = NOW()
        WHERE callback_id = ${row.callback_id}::uuid
          AND status = 'recovering'
      `;
    }
  }

  // A stale executing request might still be running remotely. Do not reset
  // it to a dispatchable state; switch to observation and let the immutable
  // result object decide the outcome.
  const staleDispatchRows = (await sql`
    WITH candidates AS (
      SELECT callback_id
      FROM app.marker_jobs
      WHERE status IN ('dispatching', 'dispatch_retry')
        AND updated_at < NOW() - INTERVAL '30 minutes'
      ORDER BY updated_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE app.marker_jobs jobs
    SET status = 'awaiting_result', updated_at = NOW()
    FROM candidates
    WHERE jobs.callback_id = candidates.callback_id
    RETURNING jobs.callback_id
  `) as { callback_id: string }[];

  // Probe ambiguous jobs on the worker cadence without mutating updated_at:
  // it remains the beginning of the grace window used to terminalize a result
  // that never appears.
  const awaitingRows = (await sql`
    SELECT callback_id
    FROM app.marker_jobs
    WHERE status = 'awaiting_result'
    ORDER BY updated_at
    LIMIT ${limit}
  `) as { callback_id: string }[];
  for (const row of [...staleDispatchRows, ...awaitingRows]) {
    try {
      await enqueueMarkerDispatchJob(row.callback_id);
    } catch (error) {
      // Preserve awaiting_result so a transient queue outage cannot turn an
      // ambiguous paid request into a fresh dispatch.
      console.error(
        `Marker result probe enqueue failed for ${row.callback_id}: ${errorMessage(error)}`,
      );
    }
  }

  const completionRows = (await sql`
    WITH candidates AS (
      SELECT callback_id
      FROM app.marker_jobs
      WHERE (
        status IN (
          'completion_queued', 'completion_enqueue_failed', 'completion_retry'
        )
        AND updated_at < NOW() - INTERVAL '15 seconds'
      ) OR (
        status = 'completing'
        AND updated_at < NOW() - INTERVAL '30 minutes'
      ) OR (
        status IN ('failure_queued', 'failure_enqueue_failed', 'failing')
        AND updated_at < NOW() - INTERVAL '15 seconds'
      )
      ORDER BY updated_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE app.marker_jobs jobs
    SET status = CASE
      WHEN jobs.status IN ('failure_queued', 'failure_enqueue_failed', 'failing')
        THEN 'failure_queued'
      WHEN jobs.completion_attempts >= ${completionLimit}
        THEN 'failure_queued'
      ELSE 'completion_queued'
    END,
    error = CASE
      WHEN jobs.status NOT IN ('failure_queued', 'failure_enqueue_failed', 'failing')
        AND jobs.completion_attempts >= ${completionLimit}
        THEN COALESCE(
          jobs.error,
          ${`Marker completion exhausted ${completionLimit} attempt(s)`}
        )
      ELSE jobs.error
    END,
    updated_at = NOW()
    FROM candidates
    WHERE jobs.callback_id = candidates.callback_id
    RETURNING jobs.callback_id, jobs.status
  `) as { callback_id: string; status: string }[];

  for (const row of completionRows) {
    try {
      if (row.status === "failure_queued") {
        await enqueueMarkerFailureJob(row.callback_id);
      } else {
        await enqueueMarkerCompletionJob(row.callback_id);
      }
    } catch (error) {
      const failedStatus =
        row.status === "failure_queued"
          ? "failure_enqueue_failed"
          : "completion_enqueue_failed";
      await sql`
        UPDATE app.marker_jobs
        SET status = ${failedStatus}, error = ${errorMessage(error)}, updated_at = NOW()
        WHERE callback_id = ${row.callback_id}::uuid
          AND status = ${row.status}
      `;
    }
  }
  return dispatchRows.length + staleDispatchRows.length + awaitingRows.length + completionRows.length;
}
