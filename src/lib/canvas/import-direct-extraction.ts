// direct uploads and extraction retries, outside the Canvas file pipeline
import {
  CanvasClaimLostError,
  withCanvasExecution,
  withCanvasPublication,
  CANVAS_CLAIM_SECONDS,
} from "./execution";
import sql from "../../database/pgsql";
import { enqueueExtractRetryJob, getCanvasQueueAttemptLimit } from "../queue.ts";
import { getStorageProvider } from "../storage/init.ts";
import logger from "../logger.ts";
import { type ExtractionRetryMessage } from "./extraction-retry.ts";
import { checkAndCompleteJob } from "./import-extraction";
import {
  errorMessage,
  FILE_TIMEOUT_MS,
  globalFileLimiter,
  runRagPipeline,
} from "./import-status";

export interface ExtractionImportRow {
  id: string;
  claim_token: string;
  retry_attempts: number;
  job_id: string;
  imported_file_cache_id: string | null;
  source_s3_key: string | null;
}

export interface ExistingExtractionImportRow extends ExtractionImportRow {
  status: string;
}

export interface DirectExtractionMessage {
  noteId: string;
  userId: string;
  s3Key: string;
  mimeType: string;
  filename?: string | null;
}

// ── Direct extraction (from /api/upload) ────────────────────────────────────

export async function processDirectExtraction(
  msg: DirectExtractionMessage,
  attempt = 0,
  maxAttempts = getCanvasQueueAttemptLimit(),
) {
  const { noteId, userId, s3Key, mimeType, filename } = msg;
  logger.info("direct extraction started");

  // Skip completed work when an at-least-once queue redelivers it.
  const [existing] = await sql`
    SELECT status FROM app.ingestion_jobs
    WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
    ORDER BY created_at DESC LIMIT 1
  `;
  if (existing?.status === "done") {
    logger.info("direct extraction skipped: already extracted");
    return;
  }

  const claimed = await sql<{ id: string }[]>`
    UPDATE app.ingestion_jobs
    SET status = 'processing', updated_at = NOW()
    WHERE note_id = ${noteId}::uuid
      AND user_id = ${userId}::uuid
      AND status = 'pending'
      AND EXISTS (
        SELECT 1
        FROM app.notes n
        WHERE n.note_id = ${noteId}::uuid
          AND n.user_id = ${userId}::uuid
          AND n.deleted_at IS NULL
      )
    RETURNING id
  `;
  if (claimed.length === 0) {
    logger.info("direct extraction skipped: note inactive");
    return;
  }

  let buffer: Buffer | undefined;
  try {
    ({ buffer } = await getStorageProvider().getObjectAndMeta(s3Key));
  } catch (error) {
    const willRetry = attempt + 1 < maxAttempts;
    await sql`
      UPDATE app.ingestion_jobs
      SET status = ${willRetry ? "pending" : "failed"},
          error = 'Failed to read file from storage', updated_at = NOW()
      WHERE id = ANY(${claimed.map(({ id }) => id)}::uuid[])
        AND status = 'processing'
    `;
    if (willRetry) throw error;
    logger.error("direct extraction failed: storage read error", { error });
    return;
  }

  if (!buffer) {
    await sql`
      UPDATE app.ingestion_jobs
      SET status = 'failed', error = 'S3 object not found', updated_at = NOW()
      WHERE note_id = ${noteId}::uuid
        AND user_id = ${userId}::uuid
        AND status = 'processing'
    `;
    logger.error("direct extraction failed: storage object not found");
    return;
  }

  try {
    const [treeRow] = await sql`
      SELECT parent_id
      FROM app.tree_items
      WHERE user_id = ${userId}::uuid AND note_id = ${noteId}::uuid
      LIMIT 1
    `;
    const sourceParentId = treeRow?.parent_id ?? null;

    const result = await runRagPipeline(
      noteId,
      userId,
      sourceParentId,
      buffer,
      {
        filename: filename ?? s3Key.split("/").pop() ?? "document",
        mimeType,
        s3Key,
      },
    );
    if (!result) {
      await sql`
        UPDATE app.ingestion_jobs
        SET status = 'pending', error = 'Queued for extraction retry', updated_at = NOW()
        WHERE note_id = ${noteId}::uuid
          AND user_id = ${userId}::uuid
          AND status = 'processing'
      `;
      logger.info("direct extraction deferred: retry queued");
      return;
    }
    if (result.pendingMarker) {
      logger.info("direct extraction queued for marker");
      return;
    }

    const chunksStored = result.chunksStored ?? 0;
    await sql`
      UPDATE app.ingestion_jobs
      SET status = 'done', chunks_stored = ${chunksStored}, error = NULL, updated_at = NOW()
      WHERE note_id = ${noteId}::uuid
        AND user_id = ${userId}::uuid
        AND status = 'processing'
    `;
    logger.info("direct extraction completed");
  } catch (error) {
    const message = errorMessage(error);
    await sql`
      UPDATE app.ingestion_jobs
      SET status = 'failed', error = ${message}, updated_at = NOW()
      WHERE note_id = ${noteId}::uuid
        AND user_id = ${userId}::uuid
        AND status = 'processing'
    `;
    logger.error("direct extraction failed", { error });
  }
}

// ── Extraction retry handler ────────────────────────────────────────────────

export async function processExtractionRetry(msg: ExtractionRetryMessage) {
  const {
    noteId,
    userId,
    s3Key,
    filename,
    mimeType,
    parentFolderId,
    attempt,
    importRecordId = null,
    jobId = null,
  } = msg;
  logger.info("extraction retry started");

  // A Canvas retry is bound to the file-row generation that produced it.
  // Messages without that identity are only retained for the independent
  // direct-extraction enrichment path; they must never claim a Canvas row.
  const [existingImport] = await sql<ExistingExtractionImportRow[]>`
    SELECT id, status, job_id, imported_file_cache_id, source_s3_key
    FROM app.canvas_imports
    WHERE note_id = ${noteId}::uuid
      AND user_id = ${userId}::uuid
      AND (${importRecordId ?? null}::uuid IS NULL OR id = ${importRecordId ?? null}::uuid)
    LIMIT 1
  `;
  let importRow: ExtractionImportRow | null = null;
  if (existingImport) {
    if (
      !importRecordId ||
      !jobId ||
      String(existingImport.id) !== String(importRecordId) ||
      String(existingImport.job_id) !== String(jobId)
    ) {
      logger.info("extraction retry ignored: unbound or stale");
      return;
    }
    const [claimed] = await sql<ExtractionImportRow[]>`
      UPDATE app.canvas_imports AS imported
      SET status = 'indexing', error_message = NULL, updated_at = NOW(),
          claim_token = gen_random_uuid(), claim_expires_at = NOW() + ${CANVAS_CLAIM_SECONDS} * INTERVAL '1 second',
          retry_attempts = retry_attempts + 1
      WHERE imported.id = ${importRecordId}::uuid
        AND imported.note_id = ${noteId}::uuid
        AND imported.user_id = ${userId}::uuid
        AND imported.job_id = ${jobId}::uuid
        AND imported.status = 'pending_retry'
        AND imported.retry_seq = ${msg.retrySeq ?? null}
        AND imported.next_attempt_at <= NOW()
        AND imported.retry_attempts < 4
        AND EXISTS (
          SELECT 1
          FROM app.canvas_import_jobs AS canvas_job
          WHERE canvas_job.id = imported.job_id
            AND canvas_job.type = 'canvas'
            AND canvas_job.status IN ('discovering', 'processing')
        )
      RETURNING imported.id, imported.job_id, imported.imported_file_cache_id,
        imported.claim_token, imported.retry_attempts, imported.source_s3_key
    `;
    if (!claimed) {
      logger.info("extraction retry ignored: claimed or inactive");
      return;
    }
    importRow = claimed;
  } else if (importRecordId || jobId) {
    logger.info("extraction retry ignored: import missing");
    return;
  }

  const run = async () => {
  try {
  const storage = getStorageProvider();
  const sourceKey = importRow?.source_s3_key ?? s3Key;
  if (!sourceKey) {
    throw new Error("Stored extraction source is missing");
  }
  const objectData = await storage.getObjectAndMeta(sourceKey);
  const buffer = objectData?.buffer;

  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("Stored extraction source is missing or empty");
  }

    await globalFileLimiter(async () => {
      // Do not Promise.race against work that cannot be aborted: that would
      // acknowledge a timeout while the original indexing keeps mutating the
      // note in the background. Keep ownership until it exits naturally.
      const warning = setTimeout(() => {
        logger.warn("extraction retry exceeded supervision threshold", { stage: "extraction retry", durationMs: FILE_TIMEOUT_MS });
      }, FILE_TIMEOUT_MS);
      try {
        const result = await runRagPipeline(noteId, userId, parentFolderId, buffer, {
          filename,
          mimeType,
          s3Key: sourceKey,
          attempt: importRow?.retry_attempts ?? attempt,
          cacheId: importRow?.imported_file_cache_id,
          jobId: importRow?.job_id ?? null,
          importRecordId: importRow?.id ?? null,
        });

        if (result?.pendingMarker) {
          return;
        }
        if (result) {
          await withCanvasPublication(async () => {
          let completed = true;
          if (importRow) {
            const [finished] = await sql`
              UPDATE app.canvas_imports
              SET status = 'complete', note_id = ${result.noteId}::uuid,
                  error_message = NULL, updated_at = NOW()
              WHERE id = ${importRow.id}::uuid
                AND job_id = ${importRow.job_id}::uuid
                AND claim_token = ${importRow.claim_token}::uuid
          AND status = 'indexing'
              RETURNING id
            `;
            completed = Boolean(finished);
          }
          if (completed) {
            await sql`
              UPDATE app.ingestion_jobs
              SET status = 'done', chunks_stored = ${result.chunksStored ?? 0}, error = NULL, updated_at = NOW()
              WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
                AND status <> 'cancelled'
            `;
          }
          });
        } else if (!importRow) {
          await sql`
            UPDATE app.ingestion_jobs
            SET status = 'pending', error = 'Queued for extraction retry', updated_at = NOW()
            WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
              AND status <> 'cancelled'
          `;
        }
      } finally {
        clearTimeout(warning);
      }
    });
  } catch (error) {
    if (error instanceof CanvasClaimLostError) return;
    const message = errorMessage(error);

    try {
      await withCanvasPublication(async () => {
        if (importRow) {
          await sql`
            UPDATE app.canvas_imports
            SET status = 'error', retryable = TRUE, error_message = ${message},
                claim_token = NULL, claim_expires_at = NULL, updated_at = NOW()
            WHERE id = ${importRow.id}::uuid AND job_id = ${importRow.job_id}::uuid
              AND claim_token = ${importRow.claim_token}::uuid AND status = 'indexing'
          `;
        }
        await sql`
          UPDATE app.ingestion_jobs
          SET status = 'failed', error = ${message}, updated_at = NOW()
          WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
            AND status NOT IN ('done', 'cancelled')
        `;
      });
    } catch (publicationError) {
      if (!(publicationError instanceof CanvasClaimLostError)) throw publicationError;
    }

    logger.error("extraction retry failed", { error });
  }
  };
  if (importRow) {
    await withCanvasExecution({ jobId: importRow.job_id, userId,
      importId: importRow.id, token: importRow.claim_token }, run);
    await checkAndCompleteJob(importRow.job_id, userId);
    return;
  }
  return run();
}

/**
 * Recover the narrow crash window after retry state commits but before its
 * queue message is published. Re-delivery is harmless because the consumer
 * compare-and-swaps `pending_retry` to `indexing` using this exact row/job.
 */
export async function recoverPendingExtractionRetries(limit: number = 50) {
  const rows = await sql`
    WITH candidates AS (
      SELECT
        imported.id,
        imported.note_id,
        imported.user_id,
        imported.job_id,
        imported.filename,
        imported.mime_type,
        imported.parent_folder_id, imported.retry_seq, imported.retry_attempts, imported.next_attempt_at,
        COALESCE(imported.source_s3_key, note.s3_key) AS s3_key
      FROM app.canvas_imports AS imported
      JOIN app.canvas_import_jobs AS canvas_job
        ON canvas_job.id = imported.job_id
      JOIN app.notes AS note
        ON note.note_id = imported.note_id
      WHERE imported.status = 'pending_retry'
        AND imported.next_attempt_at <= NOW()
        AND imported.retry_attempts < 4
        AND imported.updated_at < NOW() - INTERVAL '1 minute'
        AND canvas_job.type = 'canvas'
        AND canvas_job.status IN ('discovering', 'processing')
        AND COALESCE(imported.source_s3_key, note.s3_key) IS NOT NULL
      ORDER BY imported.updated_at
      LIMIT ${limit}
      FOR UPDATE OF imported SKIP LOCKED
    )
    UPDATE app.canvas_imports AS imported
    SET updated_at = NOW()
    FROM candidates
    WHERE imported.id = candidates.id
      AND imported.status = 'pending_retry'
    RETURNING
      imported.id AS import_record_id,
      imported.note_id,
      imported.user_id,
      imported.job_id,
      imported.filename,
      imported.mime_type,
      imported.parent_folder_id, imported.retry_seq, imported.retry_attempts, imported.next_attempt_at,
      candidates.s3_key
  `;

  let enqueued = 0;
  for (const row of rows) {
    try {
      await enqueueExtractRetryJob({
        noteId: row.note_id, userId: row.user_id, s3Key: row.s3_key,
        filename: row.filename, mimeType: row.mime_type, parentFolderId: row.parent_folder_id,
        attempt: row.retry_attempts + 1, retrySeq: row.retry_seq,
        importRecordId: row.import_record_id, jobId: row.job_id,
      }, Math.max(0, Math.ceil((new Date(row.next_attempt_at).getTime() - Date.now()) / 1000)));

      enqueued += 1;
    } catch (error) {
      logger.error("extraction retry recovery enqueue failed", { error });
    }
  }
  return enqueued;
}
