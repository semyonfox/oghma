import {
  CanvasClaimLostError,
  withCanvasExecution,
  withCanvasPublication,
  CANVAS_CLAIM_SECONDS,
} from "./execution";
/**
 * Canvas Import — Extraction Phase
 *
 * Handles downloading files from Canvas, dedup/claim logic, and
 * delegating to the RAG pipeline for content extraction + embedding.
 * Also houses the per-file queue handler. Direct uploads and retries live in
 * import-direct-extraction.ts, Marker continuations in import-marker-complete.ts.
 */

export { PROCESSABLE_TYPES, resolveMimeType } from "./file-types";
import { resolveMimeType } from "./file-types";
import { markCanvasTokenInvalid } from "./credentials";
import { createHash } from "node:crypto";
import type postgres from "postgres";
import sql from "../../database/pgsql";
import { v4 as uuidv4 } from "uuid";
import { getCanvasQueueAttemptLimit, enqueueCanvasJob } from "../queue.ts";
import { getStorageProvider } from "../storage/init.ts";

import { CanvasClient, type CanvasId } from "./client";
import { canvasIdForBigintColumn, canvasModuleIdForBigintColumn } from "./id";

import { decrypt } from "../crypto.ts";
import logger from "../logger.ts";

import { dispatchFairCanvasFiles } from "./import-scheduler.ts";
import { MAX_EXTRACTION_RETRIES, stageCanvasExtractionRetry } from "./extraction-retry.ts";

import { runFileImportWithGuard } from "./import-file";
import {
  FILE_TIMEOUT_MS,
  errorMessage,
  globalFileLimiter,
  setImportStatus,
  runRagPipeline,
} from "./import-status";

interface CanvasFileMessage {
  importRecordId: string;
  jobId: string;
  userId: string;
  attempt?: number;
}

interface CanvasImportRecord {
  id: string;
  job_id: string;
  user_id: string;
  status: string;
  canvas_token?: string | null;
  canvas_domain?: string | null;
  canvas_course_id: string | number;
  canvas_file_id: CanvasId;
  canvas_module_id?: string | number | null;
  parent_folder_id: string | null;
  s3_prefix: string;
}

interface CanvasImportJoinedRow extends CanvasImportRecord {
  canvas_token: string | null;
  canvas_domain: string | null;
}

interface CanvasExtractRow {
  id: string;
  job_id: string;
  user_id: string;
  note_id: string | null;
  filename: string | null;
  mime_type: string | null;
  parent_folder_id: string | null;
  canvas_course_id: string | number | null;
  canvas_module_id: string | number | null;
  imported_file_cache_id: string | null;
  source_s3_key: string | null;
}

// ── Constants ───────────────────────────────────────────────────────────────

export const FILE_CONCURRENCY = 5;

interface CanvasResourceFile {
  id: CanvasId;
  moduleId?: CanvasId;
  filename: string;
  parentFolderId: string | null;
  s3Prefix: string;
}

function canvasSectionFileId(courseId: string, kind: string) {
  const digest = createHash("sha256").update(`canvas-restriction:${courseId}:${kind}`).digest();
  const magnitude = digest.readBigUInt64BE(0) & ((BigInt(1) << BigInt(63)) - BigInt(1));
  return `-${magnitude || BigInt(1)}`;
}

export async function recordCanvasResourceIssue(
  courseId: string,
  userId: string,
  courseTitle: string,
  kind: string,
  jobId: string,
  message: string,
  forbidden = false,
  file?: CanvasResourceFile,
) {
  const fileId = file
    ? canvasIdForBigintColumn(file.id, "Canvas file ID")
    : canvasSectionFileId(courseId, kind);
  await withCanvasPublication(() => sql`
    INSERT INTO app.canvas_imports (
      id, user_id, canvas_course_id, canvas_module_id, canvas_file_id,
      filename, mime_type, status, error_message, job_id, retryable, parent_folder_id, s3_prefix
    )
    SELECT
      ${uuidv4()}::uuid, ${userId}::uuid, ${canvasIdForBigintColumn(courseId, "Canvas course ID")}::bigint,
      ${canvasModuleIdForBigintColumn(file?.moduleId ?? 0)}::bigint, ${fileId}::bigint,
      ${file?.filename ?? `${courseTitle} / ${kind} (course ${courseId})`},
      ${file ? resolveMimeType(file.filename) ?? "application/octet-stream" : "text/plain"},
      ${forbidden ? "forbidden" : "error"}, ${message}, ${jobId}::uuid,
      ${Boolean(file && !forbidden)}, ${file?.parentFolderId ?? null}::uuid, ${file?.s3Prefix ?? null}
    WHERE EXISTS (
      SELECT 1 FROM app.canvas_import_jobs job
      WHERE job.id = ${jobId}::uuid AND job.user_id = ${userId}::uuid
        AND job.type = 'canvas' AND job.status IN ('discovering', 'processing')
    )
      AND (${file?.parentFolderId ?? null}::uuid IS NULL OR EXISTS (
        SELECT 1 FROM app.notes parent WHERE parent.note_id = ${file?.parentFolderId ?? null}::uuid
          AND parent.user_id = ${userId}::uuid AND parent.deleted_at IS NULL
      ))
    ON CONFLICT (user_id, canvas_file_id) DO UPDATE SET
      status = EXCLUDED.status, error_message = EXCLUDED.error_message,
      job_id = EXCLUDED.job_id, retryable = EXCLUDED.retryable,
      canvas_course_id = EXCLUDED.canvas_course_id, canvas_module_id = EXCLUDED.canvas_module_id,
      mime_type = EXCLUDED.mime_type,
      filename = EXCLUDED.filename, parent_folder_id = EXCLUDED.parent_folder_id,
      s3_prefix = EXCLUDED.s3_prefix, claim_token = NULL, claim_expires_at = NULL,
      dispatched_at = NULL, updated_at = NOW()
    WHERE app.canvas_imports.canvas_file_id <= 0
      OR app.canvas_imports.status IN ('error', 'forbidden', 'cancelled')
  `);
  logger.warn("canvas-import-resource-unavailable", { jobId, courseId, kind, fileId, forbidden });
}

export async function fetchResource<T>(
  fetchFn: (courseId: string) => Promise<{
    data: T | null;
    forbidden: boolean;
    unauthorized?: boolean;
    error?: string;
  }>,
  courseId: string,
  userId: string,
  courseTitle: string,
  kind: string,
  jobId: string,
  file?: CanvasResourceFile,
) {
  const { data, forbidden, unauthorized, error } = await fetchFn(courseId);
  if (unauthorized) {
    await markCanvasTokenInvalid(userId);
    throw new Error("Invalid or expired Canvas token");
  }
  const issue = error ?? (!data && !forbidden ? "Canvas returned an empty response" : null);
  if (forbidden || issue) {
    await recordCanvasResourceIssue(courseId, userId, courseTitle, kind, jobId,
      forbidden ? `Canvas ${kind} access restricted for your account`
        : `Canvas ${kind} request failed: ${issue}`, forbidden, file);
  } else if (!file) {
    // a reclaimed discovery can succeed where its previous attempt failed
    // clear only that section's issue from the same generation
    await withCanvasPublication(() => sql`
      DELETE FROM app.canvas_imports
      WHERE user_id = ${userId}::uuid AND job_id = ${jobId}::uuid
        AND canvas_file_id = ${canvasSectionFileId(courseId, kind)}::bigint
        AND status IN ('error', 'forbidden')
    `);
  }
  // a paginated request can return valid earlier pages alongside a later error
  // keep those results and report the failed section for a future discovery run
  return { data, forbidden };
}

// marks a job complete when all its canvas_imports rows are in terminal states.
// the count check and status update share the same transaction to avoid TOCTOU.
// pending_retry and pending_marker both remain in-flight: a Canvas import is
// complete only once a queued GPU result has been written and indexed.
export async function checkAndCompleteJob(jobId: string, userId: string) {
  // fast pre-check: skip the transaction entirely if >1 file is still in-flight
  const [{ count: pending }] = await sql`
    SELECT COUNT(*) as count FROM app.canvas_imports
    WHERE job_id = ${jobId}::uuid
      AND status NOT IN ('complete', 'forbidden', 'error', 'cancelled')
  `;
  if (parseInt(pending, 10) > 1) return false;

  let weCompleted = false;
  await sql.begin(async (tx: postgres.TransactionSql) => {
    const [{ count }] = await tx`
      SELECT COUNT(*) as count FROM app.canvas_imports
      WHERE job_id = ${jobId}::uuid
        AND status NOT IN ('complete', 'forbidden', 'error', 'cancelled')
    `;
    if (parseInt(count, 10) > 0) return;

    const rows = await tx`
      SELECT id FROM app.canvas_import_jobs
      WHERE id = ${jobId}::uuid
        AND type = 'canvas'
        AND status = 'processing'
      FOR UPDATE SKIP LOCKED
    `;
    if (rows.length === 0) return;
    await tx`
      UPDATE app.canvas_import_jobs
      SET status = 'complete', completed_at = NOW(), updated_at = NOW()
      WHERE id = ${jobId}::uuid
        AND type = 'canvas'
        AND status = 'processing'
    `;
    weCompleted = true;
  });

  if (!weCompleted) return false;

  logger.info("canvas import job completed");

  try {
    const chunks = await sql<{ id: string }[]>`
      SELECT c.id FROM app.chunks c
      JOIN app.canvas_imports ci ON ci.note_id = c.document_id
      WHERE ci.job_id = ${jobId}::uuid AND c.user_id = ${userId}::uuid
    `;
    const chunkIds = chunks.map((row) => row.id);
    if (chunkIds.length > 0) {
      const { seedQuestionsAfterImport } =
        await import("../quiz/generate-background.ts");
      await seedQuestionsAfterImport(userId, chunkIds, 5);
      logger.info("canvas quiz seed completed");
    }
  } catch (seedErr) {
    logger.warn("canvas quiz seed failed", { error: seedErr });
  }
  return true;
}

// ── Per-file queue job handler ──────────────────────────────────────────────

function isPermanentCanvasImportError(error: unknown) {
  const message = errorMessage(error);
  return /CANVAS_MAX_FILE_BYTES|unsupported|Canvas credentials not found|Job cancelled|Parent folder is no longer active/i.test(
    message,
  );
}

export async function processCanvasFile({
  importRecordId,
  jobId,
  userId,
}: CanvasFileMessage) {
  logger.info("canvas file processing started");
  let record: CanvasImportRecord | null = null;
  let dbJobId: string | null = null;
  let dbUserId: string | null = null;
  const claimToken = uuidv4();
  let executionAttempts = 0;
  try {
    const [row] = await sql<CanvasImportJoinedRow[]>`
      SELECT
        ci.*,
        l.canvas_token,
        l.canvas_domain
      FROM app.canvas_imports ci
      LEFT JOIN app.canvas_import_jobs cij ON cij.id = ci.job_id
      JOIN app.login l ON l.user_id = ci.user_id
      WHERE ci.id = ${importRecordId}::uuid
    `;
    if (!row) {
      logger.error("canvas import record not found");
      return false;
    }

    // split the joined row into record shape and credentials
    const { canvas_token, canvas_domain, ...loadedRecord } = row;
    record = loadedRecord;
    dbJobId = record.job_id;
    dbUserId = record.user_id;

    // Queue payloads are only routing hints. The database row is the
    // authority for ownership, so an old at-least-once delivery cannot act on
    // a row that discovery has reused for a newer job.
    if (String(dbJobId) !== String(jobId) || String(dbUserId) !== String(userId)) {
      logger.info("canvas file delivery ignored: stale");
      return true;
    }

    // Idempotency is required because queue delivery is at least once.
    if (
      [
        "complete",
        "forbidden",
        "error",
        "cancelled",
        "pending_retry",
        "pending_marker",
        "pending_cache",
      ].includes(record.status)
    ) {
      logger.info("canvas file delivery ignored: record already terminal");
      return true;
    }

    // Claim exactly once from the scheduler-owned pending state. A duplicate
    // delivery sees no returned row and is safely acknowledged; a cancelled
    // or replaced job cannot satisfy the parent-job condition.
    const [claimed] = await sql<{ id: string; execution_attempts: number }[]>`
      UPDATE app.canvas_imports AS ci
      SET status = 'downloading', claim_token = ${claimToken}::uuid,
          claim_expires_at = NOW() + ${CANVAS_CLAIM_SECONDS} * INTERVAL '1 second',
          execution_attempts = ci.execution_attempts + 1, updated_at = NOW()
      FROM app.canvas_import_jobs AS cij
      WHERE ci.id = ${importRecordId}::uuid
        AND ci.job_id = ${dbJobId}::uuid
        AND ci.user_id = ${dbUserId}::uuid
        AND ci.status = 'pending'
        AND (ci.next_attempt_at IS NULL OR ci.next_attempt_at <= NOW())
        AND cij.id = ci.job_id
        AND cij.type = 'canvas'
        AND cij.status IN ('discovering', 'processing')
      RETURNING ci.id, ci.execution_attempts
    `;
    if (!claimed) {
      logger.info("canvas file delivery ignored: claimed or inactive");
      return true;
    }

    executionAttempts = claimed.execution_attempts;
    const activeRecord = record;
    const activeUserId = dbUserId;
    const activeJobId = dbJobId;
    await withCanvasExecution({ jobId: activeJobId, userId: activeUserId, importId: importRecordId, token: claimToken }, async () => {
    if (!canvas_token || !canvas_domain)
      throw new Error("Canvas credentials not found");
    const plainToken = decrypt(canvas_token, activeUserId);
    const client = new CanvasClient(canvas_domain, plainToken);
    const storage = getStorageProvider();

    // re-fetch a fresh download URL -- avoids any session-tied URL expiry between phases
    const {
      data: file,
      forbidden: fileForbidden,
      error: fileError,
    } = await client.getFile(
      String(activeRecord.canvas_course_id),
      activeRecord.canvas_file_id,
    );
    if (fileForbidden) {
      await setImportStatus(importRecordId, "forbidden", {
        message: "File access denied by lecturer",
      }, activeJobId);
      return false;
    }
    if (fileError || !file) {
      throw new Error(
        `Canvas file metadata request failed: ${fileError ?? "empty response"}`,
      );
    }
    // a lecturer can lock or hide a file between discovery and extraction, and the
    // shared source cache would otherwise still hand this user its content
    if (file.locked_for_user || file.hidden_for_user) {
      await setImportStatus(importRecordId, "forbidden", {
        message: file.lock_explanation || "File is locked or hidden for this Canvas user",
      }, activeJobId);
      return false;
    }

    const storedModuleId =
      activeRecord.canvas_module_id == null
        ? null
        : String(activeRecord.canvas_module_id);
    await runFileImportWithGuard(importRecordId, file, {
      userId: activeUserId,
      courseId: String(activeRecord.canvas_course_id),
      moduleId:
        storedModuleId && storedModuleId !== "0" && storedModuleId !== "-1"
          ? storedModuleId
          : null,
      parentFolderId: activeRecord.parent_folder_id,
      client,
      storage,
      jobId: activeJobId,
      s3Prefix: activeRecord.s3_prefix,
      alreadyClaimed: true,
      claimToken,
    });

    });
    await checkAndCompleteJob(dbJobId, dbUserId);
    return true;
  } catch (err) {
    if (err instanceof CanvasClaimLostError) return true;
    const message = errorMessage(err);
    logger.error("canvas file failed", { error: err });
    const retryable =
      Boolean(record && dbJobId && dbUserId) &&
      !isPermanentCanvasImportError(err) &&
      executionAttempts < getCanvasQueueAttemptLimit();
    try {
      await sql`
        UPDATE app.canvas_imports
        SET status = ${retryable ? "pending" : "error"},
            error_message = ${message}, retryable = ${!isPermanentCanvasImportError(err)},
            claim_token = NULL, claim_expires_at = NULL, dispatched_at = NULL,
            next_attempt_at = NOW() + INTERVAL '30 seconds', updated_at = NOW()
        WHERE id = ${importRecordId}::uuid
          AND claim_token = ${claimToken}::uuid
          AND job_id = ${dbJobId ?? null}::uuid
          AND user_id = ${dbUserId ?? null}::uuid
          AND status IN ('downloading', 'processing', 'indexing')
      `;
    } catch {}
    if (retryable) return true;
    if (dbJobId && dbUserId) {
      await checkAndCompleteJob(dbJobId, dbUserId);
    }
    return false;
  } finally {
    await dispatchFairCanvasFiles(1).catch((dispatchError: unknown) => {
      logger.error("Failed to release next fair import file:", dispatchError);
    });
  }
}

// The download worker commits a source note before this message is published.
// A duplicate delivery can only claim the still-pending extraction row once.
export async function processCanvasExtract({
  importRecordId,
  jobId,
  userId,
}: CanvasFileMessage) {
  const claimToken = uuidv4();
  const [claimed] = await sql<CanvasExtractRow[]>`
    UPDATE app.canvas_imports AS imported
    SET status = 'indexing', claim_token = ${claimToken}::uuid,
        claim_expires_at = NOW() + ${CANVAS_CLAIM_SECONDS} * INTERVAL '1 second',
        updated_at = NOW()
    FROM app.canvas_import_jobs AS job
    WHERE imported.id = ${importRecordId}::uuid
      AND imported.job_id = ${jobId}::uuid
      AND imported.user_id = ${userId}::uuid
      AND imported.status = 'pending_extract'
      AND job.id = imported.job_id
      AND job.type = 'canvas'
      AND job.status IN ('discovering', 'processing')
    RETURNING imported.id, imported.job_id, imported.user_id, imported.note_id,
      imported.filename, imported.mime_type, imported.parent_folder_id,
      imported.canvas_course_id, imported.canvas_module_id,
      imported.imported_file_cache_id, imported.source_s3_key
  `;
  if (!claimed) return true;

  try {
    await withCanvasExecution({ jobId, userId, importId: importRecordId, token: claimToken }, async () => {
      let s3Key: string | null = null;
      try {
        if (!claimed.note_id || !claimed.filename || !claimed.mime_type) {
          throw new Error("Stored Canvas extraction metadata is missing");
        }
        const noteId = claimed.note_id;
        const filename = claimed.filename;
        const mimeType = claimed.mime_type;
        const [source] = await sql<{ note_id: string }[]>`
          SELECT note_id FROM app.notes
          WHERE note_id = ${noteId}::uuid
            AND user_id = ${userId}::uuid
            AND deleted_at IS NULL
        `;
        const sourceKey = claimed.source_s3_key;
        if (!source || !sourceKey) throw new Error("Stored Canvas extraction source is missing");
        s3Key = sourceKey;

        const storedModuleId = claimed.canvas_module_id == null
          ? null : String(claimed.canvas_module_id);
        const canvasModuleId = storedModuleId && storedModuleId !== "0" && storedModuleId !== "-1"
          ? canvasIdForBigintColumn(storedModuleId, "Canvas module ID") : null;
        const canvasCourseId = claimed.canvas_course_id == null
          ? null : canvasIdForBigintColumn(String(claimed.canvas_course_id), "Canvas course ID");
        let canvasAssignmentId = null;
        if (!canvasModuleId && claimed.parent_folder_id) {
          const [parent] = await sql<{ canvas_assignment_id: string | number | null }[]>`
            SELECT canvas_assignment_id FROM app.notes
            WHERE note_id = ${claimed.parent_folder_id}::uuid
              AND user_id = ${userId}::uuid
          `;
          if (parent?.canvas_assignment_id != null) {
            canvasAssignmentId = canvasIdForBigintColumn(
              String(parent.canvas_assignment_id), "Canvas assignment ID",
            );
          }
        }

        await globalFileLimiter(async () => {
          const warning = setTimeout(() => {
            logger.warn("canvas extraction exceeded supervision threshold", { stage: "canvas extraction", durationMs: FILE_TIMEOUT_MS });
          }, FILE_TIMEOUT_MS);
          try {
            const objectData = await getStorageProvider().getObjectAndMeta(sourceKey);
            const buffer = objectData?.buffer;
            if (!Buffer.isBuffer(buffer)) {
              throw new Error("Stored Canvas extraction source is missing");
            }
            const result = await runRagPipeline(
              noteId, userId, claimed.parent_folder_id, buffer,
              {
                filename, mimeType, s3Key: sourceKey,
                jobId, importRecordId, cacheId: claimed.imported_file_cache_id,
                canvasCourseId, canvasModuleId, canvasAssignmentId,
              },
            );
            if (result && !result.pendingMarker) {
              await setImportStatus(importRecordId, "complete", { noteId: result.noteId }, jobId);
            }
          } finally {
            clearTimeout(warning);
          }
        });
      } catch (error) {
        if (error instanceof CanvasClaimLostError) return;
        const message = errorMessage(error);
        if (claimed.note_id && claimed.filename && claimed.mime_type && s3Key) {
          await stageCanvasExtractionRetry({
            noteId: claimed.note_id, userId, s3Key,
            filename: claimed.filename, mimeType: claimed.mime_type,
            parentFolderId: claimed.parent_folder_id, attempt: 0,
            importRecordId, jobId,
          }, message);
        } else {
          await withCanvasPublication(() => sql`
            UPDATE app.canvas_imports
            SET status = 'error', retryable = TRUE, error_message = ${message},
                claim_token = NULL, claim_expires_at = NULL, updated_at = NOW()
            WHERE id = ${importRecordId}::uuid
              AND job_id = ${jobId}::uuid
              AND user_id = ${userId}::uuid
              AND claim_token = ${claimToken}::uuid
              AND status = 'indexing'
          `);
        }
        logger.error("canvas-import-extraction-error", { jobId, importRecordId, error });
      }
    });
    await checkAndCompleteJob(jobId, userId);
    return true;
  } catch (error) {
    if (error instanceof CanvasClaimLostError) return true;
    throw error;
  } finally {
    await dispatchFairCanvasFiles(1).catch((error: unknown) => {
      logger.warn("canvas-import-extraction-dispatch-deferred", {
        jobId, importRecordId, error: errorMessage(error),
      });
    });
  }
}

async function recoverExpiredCanvasExtracts(limit: number): Promise<CanvasFileMessage[]> {
  const expired = await sql<CanvasFileMessage[]>`
    SELECT imported.id AS "importRecordId", imported.job_id AS "jobId",
      imported.user_id AS "userId"
    FROM app.canvas_imports AS imported
    JOIN app.canvas_import_jobs AS job ON job.id = imported.job_id
    WHERE imported.status = 'indexing'
      AND imported.source_s3_key IS NOT NULL
      AND imported.claim_expires_at < NOW()
      AND job.type = 'canvas'
      AND job.status IN ('discovering', 'processing')
    ORDER BY imported.claim_expires_at
    LIMIT ${limit}
  `;
  const ready: CanvasFileMessage[] = [];
  for (const row of expired) {
    const reclaimed = await sql.begin(async (tx) => {
      const [lock] = await tx<{ acquired: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtextextended(${row.userId}::text, 0)) AS acquired
      `;
      if (!lock?.acquired) return null;
      const [job] = await tx`
        SELECT id FROM app.canvas_import_jobs
        WHERE id = ${row.jobId}::uuid AND type = 'canvas'
          AND status IN ('discovering', 'processing')
        FOR SHARE SKIP LOCKED
      `;
      if (!job) return null;
      // An expired extraction usually means the worker died mid-file, and a
      // PDF that crashes the parser crashes it again. Spend a retry on every
      // reclaim so one poison file cannot restart the worker forever.
      const [changed] = await tx<{ status: string }[]>`
        UPDATE app.canvas_imports
        SET retry_attempts = retry_attempts + 1,
          status = CASE WHEN retry_attempts + 1 >= ${MAX_EXTRACTION_RETRIES}
            THEN 'error' ELSE 'pending_extract' END,
          retryable = retry_attempts + 1 >= ${MAX_EXTRACTION_RETRIES},
          error_message = 'Extraction worker stopped responding',
          claim_token = NULL, claim_expires_at = NULL, updated_at = NOW()
        WHERE id = ${row.importRecordId}::uuid
          AND job_id = ${row.jobId}::uuid AND user_id = ${row.userId}::uuid
          AND status = 'indexing' AND source_s3_key IS NOT NULL
          AND claim_expires_at < NOW()
        RETURNING status
      `;
      return changed?.status ?? null;
    });
    if (reclaimed === 'pending_extract') ready.push(row);
  }
  return ready;
}

export async function recoverPendingCanvasExtracts(limit = 50): Promise<number> {
  const reclaimed = await recoverExpiredCanvasExtracts(limit);
  const rows = await sql<CanvasFileMessage[]>`
    WITH candidates AS (
      SELECT imported.id, imported.job_id, imported.user_id
      FROM app.canvas_imports AS imported
      JOIN app.canvas_import_jobs AS job ON job.id = imported.job_id
      WHERE imported.status = 'pending_extract'
        AND imported.updated_at < NOW() - INTERVAL '1 minute'
        AND job.type = 'canvas'
        AND job.status IN ('discovering', 'processing')
      ORDER BY imported.updated_at
      LIMIT ${limit}
      FOR UPDATE OF imported SKIP LOCKED
    )
    UPDATE app.canvas_imports AS imported SET updated_at = NOW()
    FROM candidates
    WHERE imported.id = candidates.id AND imported.status = 'pending_extract'
    RETURNING imported.id AS "importRecordId", imported.job_id AS "jobId",
      imported.user_id AS "userId"
  `;
  let enqueued = 0;
  for (const row of [...reclaimed, ...rows]) {
    try {
      await enqueueCanvasJob("canvas-extract", {
        importRecordId: row.importRecordId,
        jobId: row.jobId,
        userId: row.userId,
      });
      enqueued += 1;
    } catch (error) {
      logger.warn("canvas-import-extraction-recovery-deferred", {
        jobId: row.jobId, importRecordId: row.importRecordId,
        error: errorMessage(error),
      });
    }
  }
  return enqueued;
}
