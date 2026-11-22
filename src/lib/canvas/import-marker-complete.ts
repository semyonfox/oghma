// Marker continuations: publish a finished conversion or record its failure
import { CanvasClaimLostError, withCanvasMarkerPublication } from "./execution";
import type postgres from "postgres";
import sql from "../../database/pgsql";
import { getMarkerCompletionAttemptLimit } from "../queue.ts";
import { getStorageProvider } from "../storage/init.ts";
import { deleteChunkVectors } from "../qdrant.ts";
import { processRagPipeline } from "./import-embedding";
import logger from "../logger.ts";
import { sanitizePostgresText } from "../text-sanitize.ts";
import { captureImportedPdfCache } from "./import-cache.ts";
import { checkAndCompleteJob } from "./import-extraction";
import { errorMessage } from "./import-status";
import { findOrCreateNote } from "./import-notes";

export interface MarkerContinuationMessage {
  markerJobId?: unknown;
}

export interface MarkerJobRow {
  callback_id: string;
  note_id: string;
  user_id: string;
  canvas_job_id: string | null;
  parent_folder_id: string | null;
  filename: string;
  mime_type: string;
  result_key: string;
  provider: string;
  status: string;
  error?: string | null;
  completion_attempts: number;
  imported_file_cache_id: string | null;
}

// ── Marker-complete handler ──────────────────────────────────────────────────

function markerErrorMessage(error: unknown) {
  const message = errorMessage(error);
  return message.replace(/https?:\/\/\S+/gi, "[redacted-url]").slice(0, 1_000);
}

async function finalizeMarkerFailure(
  markerJob: MarkerJobRow,
  status: string,
  message: string,
) {
  let finalized = false;
  await sql.begin(async (tx: postgres.TransactionSql) => {
    // Claim the Marker transition first. Cancellation and recovery share this
    // row as their fence; downstream Canvas/ingestion state changes only when
    // this owner still holds the claimed generation.
    const [claimed] = await tx`
      UPDATE app.marker_jobs
      SET status = ${status}, error = ${message}, completed_at = NOW(), updated_at = NOW()
      WHERE callback_id = ${markerJob.callback_id}::uuid
        AND status = ${markerJob.status}
        AND (
          ${markerJob.status} <> 'completing'
          OR completion_attempts = ${markerJob.completion_attempts}
        )
      RETURNING callback_id
    `;
    if (!claimed) return;
    finalized = true;
    await tx`
      UPDATE app.canvas_imports
      SET status = 'error', error_message = ${message}, updated_at = NOW()
      WHERE note_id = ${markerJob.note_id}::uuid
        AND status = 'pending_marker'
    `;
    await tx`
      UPDATE app.ingestion_jobs
      SET status = 'failed', error = ${message}, updated_at = NOW()
      WHERE note_id = ${markerJob.note_id}::uuid
        AND user_id = ${markerJob.user_id}::uuid
        AND status NOT IN ('done', 'cancelled')
    `;
  });
  if (finalized && markerJob.canvas_job_id) {
    await checkAndCompleteJob(markerJob.canvas_job_id, markerJob.user_id);
  }
  return finalized;
}

function startMarkerCompletionHeartbeat(markerJob: MarkerJobRow) {
  const timer = setInterval(() => {
    void sql`
      UPDATE app.marker_jobs
      SET updated_at = NOW()
      WHERE callback_id = ${markerJob.callback_id}::uuid
        AND status = 'completing'
        AND completion_attempts = ${markerJob.completion_attempts}
    `.catch((error: unknown) => {
      logger.warn("marker completion heartbeat failed", { error });
    });
  }, 30_000);
  return timer;
}

export async function processMarkerFailed(msg: MarkerContinuationMessage) {
  const markerJobId = msg?.markerJobId;
  if (typeof markerJobId !== "string") {
    throw new Error("marker-failed is missing markerJobId");
  }

  const [markerJob] = await sql<MarkerJobRow[]>`
    UPDATE app.marker_jobs
    SET status = 'failing', updated_at = NOW()
    WHERE callback_id = ${markerJobId}::uuid
      AND status IN ('failure_queued', 'failure_enqueue_failed')
    RETURNING *
  `;
  if (!markerJob) return;

  const message =
    markerJob.error ||
    `${markerJob.provider} Marker dispatch failed before a result was available`;
  await finalizeMarkerFailure(markerJob, "failed", message);
}

export async function processMarkerComplete(msg: MarkerContinuationMessage) {
  const markerJobId = msg?.markerJobId;
  if (typeof markerJobId !== "string") {
    throw new Error("marker-complete is missing markerJobId");
  }

  const maxAttempts = getMarkerCompletionAttemptLimit();
  const [markerJob] = await sql<MarkerJobRow[]>`
    UPDATE app.marker_jobs
    SET status = 'completing',
        completion_attempts = completion_attempts + 1,
        completion_started_at = NOW(),
        updated_at = NOW()
    WHERE callback_id = ${markerJobId}::uuid
      AND status IN (
        'completion_queued', 'completion_enqueue_failed', 'completion_retry'
      )
      AND completion_attempts < ${maxAttempts}
      AND (canvas_job_id IS NULL OR EXISTS (
        SELECT 1 FROM app.canvas_import_jobs parent
        WHERE parent.id = canvas_job_id
          AND parent.status IN ('discovering', 'processing')
      ))
    RETURNING *
  `;
  // A duplicate queue delivery, a completed job, or a currently claimed
  // continuation is already accounted for by the database state machine.
  if (!markerJob) return;

  logger.info("marker completion started");
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  try {
    const [markerResultModule, markerOutputModule, ocrModule] = await Promise.all([
      import("../marker/result.ts"),
      import("../marker/output.ts"),
      import("../marker/ocr.ts"),
    ]);
    const { parseMarkerResult, markerResultByteLimit, MarkerResultValidationError } =
      markerResultModule;
    const { normalizeMarkerMarkdown } = markerOutputModule;
    const { splitMarkdownToChunks } = ocrModule;

    const storage = getStorageProvider();
    const resultMeta = await storage.getObjectMeta(markerJob.result_key);
    if (!resultMeta) {
      throw new Error("Marker result missing from object storage");
    }
    if (
      typeof resultMeta.contentLength === "number" &&
      Number.isFinite(resultMeta.contentLength) &&
      resultMeta.contentLength > markerResultByteLimit()
    ) {
      throw new MarkerResultValidationError("Marker result exceeds the size limit");
    }
    const resultBody = await storage.getObject(markerJob.result_key);
    if (!resultBody) {
      throw new Error("Marker result missing from object storage");
    }
    const markerOutput = parseMarkerResult(resultBody, {
      callbackId: markerJob.callback_id,
      resultKey: markerJob.result_key,
    });
    const normalizedText = sanitizePostgresText(
      normalizeMarkerMarkdown(markerOutput.output),
    );
    if (!normalizedText.trim()) {
      throw new MarkerResultValidationError("Marker result normalizes to empty output");
    }
    const chunks = splitMarkdownToChunks(normalizedText).map((chunk) =>
      sanitizePostgresText(chunk),
    );

    const [importRows] = await Promise.all([
      sql`
        SELECT id, imported_file_cache_id
        FROM app.canvas_imports
        WHERE note_id = ${markerJob.note_id}::uuid
          AND user_id = ${markerJob.user_id}::uuid
          AND (${markerJob.canvas_job_id ?? null}::uuid IS NULL
            OR job_id = ${markerJob.canvas_job_id ?? null}::uuid)
        LIMIT 1
      `,
    ]);
    const importRow = importRows[0] ?? null;
    const [stillActive] = markerJob.imported_file_cache_id
      ? await sql`
          SELECT marker.callback_id
          FROM app.marker_jobs marker
          JOIN app.notes source ON source.note_id = marker.note_id
          WHERE marker.callback_id = ${markerJob.callback_id}::uuid
            AND marker.status = 'completing'
            AND marker.completion_attempts = ${markerJob.completion_attempts}
            AND marker.imported_file_cache_id IS NOT NULL
            AND source.is_import_cache_source = TRUE
            AND source.deleted_at IS NULL
        `
      : await sql`
          SELECT marker.callback_id
          FROM app.marker_jobs marker
          JOIN app.notes source
            ON source.note_id = marker.note_id AND source.user_id = marker.user_id
          LEFT JOIN app.canvas_imports imported
            ON imported.note_id = marker.note_id
            AND imported.user_id = marker.user_id
            AND (marker.canvas_job_id IS NULL OR imported.job_id = marker.canvas_job_id)
          LEFT JOIN app.canvas_import_jobs canvas_job
            ON canvas_job.id = marker.canvas_job_id
          WHERE marker.callback_id = ${markerJob.callback_id}::uuid
            AND marker.status = 'completing'
            AND marker.completion_attempts = ${markerJob.completion_attempts}
            AND source.deleted_at IS NULL
            AND (
              (imported.status = 'pending_marker' AND (
                marker.canvas_job_id IS NULL
                OR (canvas_job.type = 'canvas' AND canvas_job.status IN ('discovering', 'processing'))
              ))
              OR (
                marker.canvas_job_id IS NULL AND imported.id IS NULL
                AND EXISTS (
                  SELECT 1 FROM app.ingestion_jobs ingestion
                  WHERE ingestion.note_id = marker.note_id AND ingestion.user_id = marker.user_id
                    AND ingestion.status IN ('pending', 'processing')
                )
              )
            )
        `;
    if (!stillActive) return;
    heartbeat = startMarkerCompletionHeartbeat(markerJob);
    let completed = false;
    await withCanvasMarkerPublication({ jobId: markerJob.canvas_job_id ?? "", userId: markerJob.user_id,
      token: markerJob.callback_id, markerId: markerJob.callback_id, markerAttempt: markerJob.completion_attempts }, async () => {
    const result = await processRagPipeline(
      markerJob.note_id,
      markerJob.user_id,
      markerJob.parent_folder_id ?? null,
      null,
      {
        filename: markerJob.filename,
        mimeType: markerJob.mime_type,
        s3Key: null,
        attempt: 0,
        jobId: markerJob.canvas_job_id,
        importRecordId: importRow?.id ?? null,
        retryOnFailure: false,
        extractionOverride: {
          rawText: normalizedText,
          chunks,
          source: "marker",
          markerImages: markerOutput.images,
          markerMetadata: markerOutput.metadata,
          pageRange: markerOutput.pageRange,
        },
      },
      findOrCreateNote,
    );
    if (!result) {
      throw new Error("Marker completion returned no indexing result");
    }
    await sql.begin(async (tx: postgres.TransactionSql) => {
      // Claim the terminal Marker transition before touching derived state.
      // Cancellation locks this same row first, so a losing completion cannot
      // publish notes/chunks as a successful import.
      const [claimed] = await tx`
        UPDATE app.marker_jobs
        SET status = 'completed', error = NULL, result_bytes = ${markerOutput.byteLength},
            result_sha256 = ${markerOutput.sha256}, completed_at = NOW(), updated_at = NOW()
        WHERE callback_id = ${markerJob.callback_id}::uuid
          AND status = 'completing'
          AND completion_attempts = ${markerJob.completion_attempts}
        RETURNING callback_id
      `;
      if (!claimed) return;
      completed = true;
      if (!markerJob.imported_file_cache_id) {
        await tx`
          UPDATE app.canvas_imports
          SET status = 'complete', note_id = ${result.noteId}::uuid,
              error_message = NULL, updated_at = NOW()
          WHERE note_id = ${markerJob.note_id}::uuid
            AND status = 'pending_marker'
        `;
      }
      await tx`
        UPDATE app.ingestion_jobs
        SET status = 'done', chunks_stored = ${result.chunksStored ?? 0}, error = NULL, updated_at = NOW()
        WHERE note_id = ${markerJob.note_id}::uuid
          AND user_id = ${markerJob.user_id}::uuid
        AND status NOT IN ('done', 'cancelled')
      `;
    });
    const cacheId = markerJob.imported_file_cache_id ?? importRow?.imported_file_cache_id;
    let cacheCaptured = false;
    if (completed && cacheId) {
      try {
        await captureImportedPdfCache({ cacheId, sourceNoteId: result.noteId });
        cacheCaptured = true;
      } catch (cacheError) {
        logger.warn("marker cache capture failed", { error: cacheError });
      }
    }
    // The canonical source note exists only to use the durable Marker state
    // machine. Its output has been captured in the shared cache above, so it
    // must not become a second user-scoped retrieval result.
    if (completed && markerJob.imported_file_cache_id && cacheCaptured) {
      const sourceChunks = await sql`
        SELECT id FROM app.chunks WHERE document_id = ${markerJob.note_id}::uuid
      `;
      await deleteChunkVectors(sourceChunks.map((chunk) => chunk.id)).catch(() => undefined);
      await sql`
        DELETE FROM app.chunks WHERE document_id = ${markerJob.note_id}::uuid
      `;
    }
    });
    if (completed && markerJob.canvas_job_id) {
      await checkAndCompleteJob(markerJob.canvas_job_id, markerJob.user_id);
    }
  } catch (error) {
    if (error instanceof CanvasClaimLostError) return;
    const message = markerErrorMessage(error);
    logger.error("marker completion failed", { error });
    const { MarkerResultValidationError } = await import("../marker/result.ts");
    if (error instanceof MarkerResultValidationError) {
      await finalizeMarkerFailure(markerJob, "invalid_result", message);
      return;
    }

    if (markerJob.completion_attempts >= maxAttempts) {
      await finalizeMarkerFailure(markerJob, "failed", message);
      return;
    }

    await sql`
      UPDATE app.marker_jobs
      SET status = 'completion_retry', error = ${message}, updated_at = NOW()
      WHERE callback_id = ${markerJob.callback_id}::uuid
        AND status = 'completing'
        AND completion_attempts = ${markerJob.completion_attempts}
    `;
    throw new Error(message);
  } finally {
    if (heartbeat) clearInterval(heartbeat);
  }
}
