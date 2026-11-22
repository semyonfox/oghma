import { CanvasClaimLostError, withCanvasPublication } from "./execution";

import { PROCESSABLE_TYPES, resolveMimeType } from "./file-types";

import type postgres from "postgres";
import sql from "../../database/pgsql";
import { v4 as uuidv4 } from "uuid";
import { enqueueCanvasJob } from "../queue.ts";

import type { StoreS3 } from "../storage/s3.ts";
import { findOrCreateExtractionBundle } from "../notes/extraction-bundle.ts";
import {
  CanvasClient,
  MAX_CANVAS_FILE_BYTES,
  type CanvasFile,
  type CanvasId,
} from "./client";
import { canvasIdForBigintColumn, canvasModuleIdForBigintColumn } from "./id";

import { findOrCreateNote } from "./import-notes";

import { type RagPipelineResult } from "./import-embedding";

import logger from "../logger.ts";

import {
  cloneImportedPdfCacheToNote,
  canvasFileSource,
  ensureImportedFileCacheRow,
  getImportedFileCacheBySha,
  getImportedFileCacheByCanvasSource,
  importedFileStorageKey,
  markImportedFileCacheFailed,
  recordImportedFileCanvasSource,
  sha256Hex,
  withImportedFileLock,
  type ImportedFileCacheRow,
} from "./import-cache.ts";

import {
  FILE_TIMEOUT_MS,
  errorMessage,
  globalFileLimiter,
  setImportStatus,
  isJobCancelled,
  runRagPipeline,
} from "./import-status";

// downloads one Canvas file, reuses a cached conversion when it can, and hands it to extraction

interface ImportableCanvasFile extends CanvasFile {
  display_name: string;
  filename: string;
  content_type: string;
  url: string;
}

type FileStorage = Pick<StoreS3, "hasObject" | "putObject">;

interface FileImportOptions {
  userId: string;
  courseId: string;
  moduleId: CanvasId | null;
  parentFolderId: string | null;
  client: Pick<CanvasClient, "baseUrl" | "downloadFile">;
  storage: FileStorage;
  s3Prefix: string;
  jobId?: string | null;
  alreadyClaimed?: boolean;
  claimToken?: string;
}

function assertImportableCanvasFile(file: CanvasFile): asserts file is ImportableCanvasFile {
  if (
    typeof file.display_name !== "string" ||
    typeof file.filename !== "string" ||
    typeof file.content_type !== "string" ||
    typeof file.url !== "string"
  ) {
    throw new Error("Canvas file metadata is missing a name, MIME type, or download URL");
  }
}

// ── Concurrency limiters ────────────────────────────────────────────────────

async function createAttachment(
  noteId: string,
  userId: string,
  filename: string,
  s3Key: string,
  mimeType: string,
  fileSize: number,
) {
  return withCanvasPublication(async () => {
  await sql`
    INSERT INTO app.attachments (id, note_id, user_id, filename, s3_key, mime_type, file_size)
    VALUES (${uuidv4()}::uuid, ${noteId}::uuid, ${userId}::uuid,
      ${filename}, ${s3Key}, ${mimeType}, ${fileSize})
    ON CONFLICT (note_id, s3_key) DO UPDATE SET
      filename = EXCLUDED.filename, mime_type = EXCLUDED.mime_type,
      file_size = EXCLUDED.file_size
  `;

  });
}

async function reuseImportedPdfCache(
  cache: ImportedFileCacheRow,
  file: ImportableCanvasFile,
  opts: FileImportOptions,
  importRecordId: string,
): Promise<RagPipelineResult> {
  return withCanvasPublication(async () => {
  const canvasCourseId = opts.courseId
    ? canvasIdForBigintColumn(opts.courseId, "Canvas course ID")
    : null;
  const canvasModuleId = opts.moduleId
    ? canvasIdForBigintColumn(opts.moduleId, "Canvas module ID")
    : null;
  let canvasAssignmentId = null;
  if (!opts.moduleId && opts.parentFolderId) {
    const [parent] =
      await sql`SELECT canvas_assignment_id FROM app.notes WHERE note_id = ${opts.parentFolderId}::uuid`;
    canvasAssignmentId =
      parent?.canvas_assignment_id == null
        ? null
        : canvasIdForBigintColumn(
            String(parent.canvas_assignment_id),
            "Canvas assignment ID",
          );
  }
  const bundleFolderId = await findOrCreateExtractionBundle(
    opts.userId,
    opts.parentFolderId,
    file.display_name,
  );
  const binary = await findOrCreateNote(
    opts.userId,
    file.display_name,
    bundleFolderId,
    {
      s3Key: cache.storage_key,
      canvasImportId: importRecordId,
      canvasCourseId,
      canvasModuleId,
      canvasAssignmentId,
    },
  );
  await createAttachment(
    binary.noteId,
    opts.userId,
    file.display_name,
    cache.storage_key,
    cache.mime_type,
    Number(cache.file_size),
  );
  const md = await findOrCreateNote(
    opts.userId,
    file.display_name.replace(/\.[^.]+$/, "") + ".md",
    bundleFolderId,
    { content: "", canvasImportId: importRecordId,
      canvasCourseId, canvasModuleId, canvasAssignmentId },
  );
  const chunksStored = await cloneImportedPdfCacheToNote({
    cacheId: cache.id,
    noteId: md.noteId,
    extractedFromNoteId: binary.noteId,
    userId: opts.userId,
    onlyIfEmpty: !md.created,
  });
  await sql`UPDATE app.notes SET imported_file_cache_id = ${cache.id}::uuid,
    s3_key = ${cache.storage_key}, updated_at = NOW() WHERE note_id = ${binary.noteId}::uuid`;
  await sql`UPDATE app.canvas_imports SET imported_file_cache_id = ${cache.id}::uuid,
    note_id = ${binary.noteId}::uuid, status = 'indexing', updated_at = NOW()
    WHERE id = ${importRecordId}::uuid
      AND (${opts.jobId ?? null}::uuid IS NULL OR job_id = ${opts.jobId ?? null}::uuid)
      AND status IN ('downloading', 'processing')`;
  return { noteId: md.noteId, chunksStored };

  });
}

async function hasReusableImportedPdfCacheObject(
  cache: ImportedFileCacheRow,
  storage: FileStorage,
  opts: FileImportOptions,
) {
  const exists = await storage.hasObject(cache.storage_key);
  if (!exists) {
    logger.warn("canvas-import-shared-cache-object-missing", {
      jobId: opts.jobId,
      cacheId: cache.id,
      storageKey: cache.storage_key,
    });
  }
  return exists;
}

// ── File import ─────────────────────────────────────────────────────────────

async function stageCanvasExtraction(
  importRecordId: string,
  noteId: string,
  sourceKey: string,
  opts: FileImportOptions,
) {
  if (!opts.jobId || !opts.claimToken) {
    throw new Error("Canvas extraction handoff requires an active file claim");
  }
  const [staged] = await withCanvasPublication(() => sql<{ id: string }[]>`
    UPDATE app.canvas_imports AS imported
    SET status = 'pending_extract', note_id = ${noteId}::uuid,
        source_s3_key = ${sourceKey},
        claim_token = NULL, claim_expires_at = NULL, dispatched_at = NULL,
        next_attempt_at = NULL, error_message = NULL, updated_at = NOW()
    WHERE imported.id = ${importRecordId}::uuid
      AND imported.job_id = ${opts.jobId}::uuid
      AND imported.user_id = ${opts.userId}::uuid
      AND imported.claim_token = ${opts.claimToken}::uuid
      AND imported.status IN ('processing', 'indexing')
      AND EXISTS (
        SELECT 1 FROM app.notes source
        WHERE source.note_id = ${noteId}::uuid
          AND source.user_id = ${opts.userId}::uuid
          AND source.deleted_at IS NULL
      )
    RETURNING imported.id
  `);
  if (!staged) throw new Error("Stored Canvas extraction source is missing");

  try {
    await enqueueCanvasJob("canvas-extract", {
      importRecordId,
      jobId: opts.jobId,
      userId: opts.userId,
    });
  } catch (error) {
    logger.warn("canvas-import-extraction-enqueue-deferred", {
      jobId: opts.jobId,
      importRecordId,
      error: errorMessage(error),
    });
  }
}

async function _runFileImport(
  importRecordId: string,
  file: CanvasFile,
  opts: FileImportOptions,
) {
  assertImportableCanvasFile(file);
  const {
    userId,
    courseId,
    moduleId,
    parentFolderId,
    client,
    storage,
    s3Prefix,
  } = opts;
  if (await isJobCancelled(opts.jobId)) throw new Error("Job cancelled");
  const resolvedMimeType = resolveMimeType(
    file.display_name,
    file.content_type,
  );

  if (!resolvedMimeType || !PROCESSABLE_TYPES.has(resolvedMimeType)) {
    if (opts.alreadyClaimed) throw new Error("Unsupported Canvas file type after discovery");
    logger.info("canvas file skipped: not processable");
    return { skipped: true };
  }

  const declaredSize = Number(file.size);
  if (Number.isFinite(declaredSize) && declaredSize > MAX_CANVAS_FILE_BYTES) {
    throw new Error(
      `Canvas file exceeds CANVAS_MAX_FILE_BYTES (${MAX_CANVAS_FILE_BYTES} bytes): ${file.display_name}`,
    );
  }

  // Atomically check dedup + claim the import slot. The two-phase worker
  // arrives here with a `pending` row already compare-and-swapped to
  // `downloading`; legacy messages claim only a terminal/pending-for-this-job
  // row below. In neither path can a duplicate delivery take over an active
  // or cancelled row.
  const canvasCourseIdForStorage = canvasIdForBigintColumn(
    courseId,
    "Canvas course ID",
  );
  const canvasModuleIdForStorage = canvasModuleIdForBigintColumn(moduleId ?? -1);
  const canvasFileIdForStorage = canvasIdForBigintColumn(
    file.id,
    "Canvas file ID",
  );
  const claimed = opts.alreadyClaimed
    ? true
    : await sql.begin(async (tx: postgres.TransactionSql) => {
        if (opts.jobId) {
          const [activeJob] = await tx`
            SELECT id
            FROM app.canvas_import_jobs
            WHERE id = ${opts.jobId}::uuid
              AND type = 'canvas'
              AND status IN ('discovering', 'processing')
            FOR UPDATE
          `;
          if (!activeJob) return false;
        }

        const [existing] = await tx`
          SELECT id, status, job_id
          FROM app.canvas_imports
          WHERE user_id = ${userId}::uuid
            AND canvas_file_id = ${canvasFileIdForStorage}::bigint
          FOR UPDATE
        `;
        if (existing) {
          const reusable =
            ["error", "forbidden", "cancelled"].includes(existing.status) ||
            (existing.status === "pending" && existing.job_id === opts.jobId);
          if (!reusable) return false;
          const updated = await tx`
            UPDATE app.canvas_imports
            SET status = 'downloading',
                job_id = ${opts.jobId ?? null}::uuid,
                filename = ${file.display_name},
                mime_type = ${resolvedMimeType},
                dispatched_at = NOW(),
                error_message = NULL,
                updated_at = NOW()
            WHERE id = ${existing.id}::uuid
              AND status IN ('pending', 'error', 'forbidden', 'cancelled')
            RETURNING id
          `;
          return updated.length > 0;
        }

        const inserted = await tx`
          INSERT INTO app.canvas_imports (
            id, user_id, canvas_course_id, canvas_module_id, canvas_file_id,
            filename, mime_type, status, job_id, dispatched_at
          ) VALUES (
            ${importRecordId}::uuid, ${userId}::uuid,
            ${canvasCourseIdForStorage}::bigint, ${canvasModuleIdForStorage}::bigint,
            ${canvasFileIdForStorage}::bigint, ${file.display_name},
            ${resolvedMimeType}, 'downloading', ${opts.jobId ?? null}::uuid, NOW()
          )
          ON CONFLICT (user_id, canvas_file_id) DO NOTHING
          RETURNING id
        `;
        return inserted.length > 0;
      });
  if (!claimed) {
    logger.info("canvas file skipped: already imported or pending");
    return { skipped: true };
  }

  const canvasSource =
    resolvedMimeType === "application/pdf"
      ? canvasFileSource({
          baseUrl: client.baseUrl,
          file,
          mimeType: resolvedMimeType,
        })
      : null;
  if (canvasSource) {
    const sourceCache = await getImportedFileCacheByCanvasSource(canvasSource);
    const reused = sourceCache
      ? await withCanvasPublication(() => withImportedFileLock(sourceCache.sha256, async () => {
          // A source lookup happens before the file bytes are available. It
          // must share the content-addressed lock with cache retention so an
          // expired object cannot disappear between lookup and note creation.
          const currentCache = await getImportedFileCacheBySha(sourceCache.sha256);
          if (
            !currentCache ||
            currentCache.status !== "ready" ||
            !currentCache.replayable ||
            !(await hasReusableImportedPdfCacheObject(currentCache, storage, opts))
          ) {
            return null;
          }
          return reuseImportedPdfCache(
            currentCache,
            file,
            opts,
            importRecordId,
          );
        }))
      : null;
    if (reused) {
      logger.info("canvas-import-file-source-cache-hit", {
        jobId: opts.jobId,
        canvasFileId: file.id,
        tenant: canvasSource.tenant,
        fileSizeBytes: canvasSource.fileSize,
      });
      await setImportStatus(importRecordId, "complete", {
        noteId: reused.noteId,
      }, opts.jobId);
      return;
    }
  }

  const downloadStart = Date.now();
  const {
    buffer,
    forbidden: dlForbidden,
    error: downloadError,
  } = await client.downloadFile(
    file.url,
  );
  const downloadElapsedMs = Date.now() - downloadStart;

  if (dlForbidden) {
    logger.info("canvas file skipped: download forbidden");
    await setImportStatus(importRecordId, "forbidden", {
      message: "File access denied by lecturer",
    }, opts.jobId);
    return;
  }
  if (!buffer) {
    throw new Error(
      `Canvas file download failed: ${downloadError ?? "empty response"}`,
    );
  }

  logger.info("canvas-import-file-downloaded", {
    jobId: opts.jobId,
    filename: file.display_name,
    fileSizeBytes: buffer.length,
    elapsedMs: downloadElapsedMs,
    elapsedSecs: (downloadElapsedMs / 1000).toFixed(2),
  });

  const sha256 = resolvedMimeType === "application/pdf" ? sha256Hex(buffer) : null;
  const s3Key = sha256
    ? importedFileStorageKey(sha256)
    : `${s3Prefix}/${importRecordId}/${sha256Hex(buffer)}/${file.filename}`;
  await setImportStatus(importRecordId, "processing", {}, opts.jobId);

  // resolve canvas metadata: module files have moduleId set; assignment files do not,
  // so look up canvas_assignment_id from the parent assignment folder
  const canvasCourseId = courseId
    ? canvasIdForBigintColumn(courseId, "Canvas course ID")
    : null;
  const canvasModuleId = moduleId
    ? canvasIdForBigintColumn(moduleId, "Canvas module ID")
    : null;
  let canvasAssignmentId = null;
  if (!moduleId && parentFolderId) {
    const [parentFolder] = await sql`
      SELECT canvas_assignment_id FROM app.notes WHERE note_id = ${parentFolderId}::uuid LIMIT 1
    `;
    canvasAssignmentId =
      parentFolder?.canvas_assignment_id == null
        ? null
        : canvasIdForBigintColumn(
            String(parentFolder.canvas_assignment_id),
            "Canvas assignment ID",
          );
  }

  if (sha256) {
    // The hash lock covers only the durable ownership decision. Holding it
    // through OCR would reserve another pool connection for every waiter.
    const claimedCache = await withCanvasPublication(() => withImportedFileLock(sha256, async () => {
      const existing = await getImportedFileCacheBySha(sha256);
      if (existing?.status === "ready" && existing.replayable) {
        // Pin the cache before releasing the retention lock for replay.
        await sql`UPDATE app.canvas_imports SET imported_file_cache_id = ${existing.id}::uuid
          WHERE id = ${importRecordId}::uuid`;
        return { kind: "ready" as const, cache: existing };
      }
      if (existing?.owner_import_id &&
          (existing.owner_import_id !== importRecordId || existing.owner_job_id !== opts.jobId)) {
        const [owner] = await sql`
          SELECT imported.id FROM app.canvas_imports imported
          JOIN app.canvas_import_jobs job ON job.id = imported.job_id
          WHERE imported.id = ${existing.owner_import_id}::uuid
            AND imported.job_id = ${existing.owner_job_id ?? null}::uuid
            AND imported.status IN ('pending', 'downloading', 'processing', 'pending_extract', 'indexing', 'pending_marker', 'pending_retry')
            AND job.status IN ('discovering', 'processing')
        `;
        if (owner) {
          await sql`UPDATE app.canvas_imports SET status = 'pending_cache',
            imported_file_cache_id = ${existing.id}::uuid, claim_token = NULL, claim_expires_at = NULL,
            execution_attempts = GREATEST(0, execution_attempts - 1), updated_at = NOW()
            WHERE id = ${importRecordId}::uuid`;
          return { kind: "waiting" as const, cache: existing };
        }
      }
      const cache = await ensureImportedFileCacheRow({ sha256, mimeType: resolvedMimeType,
        fileSize: buffer.length, storageKey: s3Key, importId: importRecordId, jobId: opts.jobId });
      await sql`UPDATE app.canvas_imports SET imported_file_cache_id = ${cache.id}::uuid
        WHERE id = ${importRecordId}::uuid`;
      await recordImportedFileCanvasSource(cache.id, canvasSource);
      return { kind: "producer" as const, cache };
    }));
    if (claimedCache.kind === "waiting") return;
    const cache = claimedCache.cache;
    if (claimedCache.kind === "ready") {
      if (!(await hasReusableImportedPdfCacheObject(cache, storage, opts))) {
        // The downloaded bytes matched this SHA; restore only the binary.
        await storage.putObject(cache.storage_key, buffer, { contentType: resolvedMimeType });
      }
      const result = await reuseImportedPdfCache(cache, file, opts, importRecordId);
      await setImportStatus(importRecordId, "complete", { noteId: result.noteId }, opts.jobId);
      return;
    }
    try {
      // An immutable content-addressed upload is safe even if this attempt
      // loses ownership. Only a guarded DB publication attaches it to a user.
      await storage.putObject(s3Key, buffer, { contentType: resolvedMimeType });
      const bundleFolderId = await withCanvasPublication(() => findOrCreateExtractionBundle(userId, parentFolderId, file.display_name));
      const { noteId } = await findOrCreateNote(userId, file.display_name, bundleFolderId,
        { s3Key, canvasImportId: importRecordId,
          canvasCourseId, canvasModuleId, canvasAssignmentId });
      await createAttachment(noteId, userId, file.display_name, s3Key, resolvedMimeType, buffer.length);
      await withCanvasPublication(() => sql`
        UPDATE app.notes
        SET s3_key = ${s3Key}, imported_file_cache_id = ${cache.id}::uuid,
            updated_at = NOW()
        WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
          AND deleted_at IS NULL
      `);
      if (opts.alreadyClaimed && opts.claimToken) {
        await stageCanvasExtraction(importRecordId, noteId, s3Key, opts);
        return;
      }
      await setImportStatus(importRecordId, "indexing", { noteId }, opts.jobId);
      const result = await runRagPipeline(noteId, userId, bundleFolderId, buffer, {
        filename: file.display_name, mimeType: resolvedMimeType, s3Key,
        jobId: opts.jobId, importRecordId, cacheId: cache.id,
        canvasCourseId, canvasModuleId, canvasAssignmentId,
      });
      if (!result || result.pendingMarker) return;
      await setImportStatus(importRecordId, "complete", { noteId: result.noteId }, opts.jobId);
    } catch (error) {
      if (!(error instanceof CanvasClaimLostError)) {
        await withCanvasPublication(() => markImportedFileCacheFailed(cache.id, errorMessage(error)));
      }
      throw error;
    }
    return;
  }

  if (await isJobCancelled(opts.jobId)) throw new Error("Job cancelled");
  await storage.putObject(s3Key, buffer, { contentType: resolvedMimeType });
  if (await isJobCancelled(opts.jobId)) throw new Error("Job cancelled");
  const { noteId } = await findOrCreateNote(
    userId,
    file.display_name,
    parentFolderId,
    { s3Key, canvasImportId: importRecordId,
      canvasCourseId, canvasModuleId, canvasAssignmentId },
  );

  // create attachment record so the upload GET handler can verify ownership
  await createAttachment(
    noteId,
    userId,
    file.display_name,
    s3Key,
    resolvedMimeType,
    buffer.length,
  );
  await withCanvasPublication(() => sql`
    UPDATE app.notes SET s3_key = ${s3Key}, updated_at = NOW()
    WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
      AND deleted_at IS NULL
  `);

  if (opts.alreadyClaimed && opts.claimToken) {
    await stageCanvasExtraction(importRecordId, noteId, s3Key, opts);
    return;
  }

  await setImportStatus(importRecordId, "indexing", { noteId }, opts.jobId);

  const ragStart = Date.now();
  const ragResult = await runRagPipeline(
    noteId,
    userId,
    parentFolderId,
    buffer,
    {
      filename: file.display_name,
      mimeType: resolvedMimeType,
      s3Key,
      jobId: opts.jobId,
      importRecordId,
      canvasCourseId,
      canvasModuleId,
      canvasAssignmentId,
    },
  );
  const ragElapsedMs = Date.now() - ragStart;

  if (ragResult === null) {
    return;
  }
  if (ragResult.pendingMarker) return;

  logger.info("canvas-import-file-processed", {
    jobId: opts.jobId,
    filename: file.display_name,
    ragElapsedMs,
    ragElapsedSecs: (ragElapsedMs / 1000).toFixed(2),
    chunksStored: ragResult.chunksStored,
  });

  if (await isJobCancelled(opts.jobId)) {
    await withCanvasPublication(() => sql`
      UPDATE app.canvas_imports
      SET status = 'cancelled', updated_at = NOW()
      WHERE id = ${importRecordId}::uuid
        AND job_id = ${opts.jobId ?? null}::uuid
        AND status NOT IN ('complete', 'forbidden', 'error', 'cancelled')
    `);
    return;
  }

  await setImportStatus(
    importRecordId,
    "complete",
    { noteId: ragResult.noteId },
    opts.jobId,
  );
  logger.info("canvas file processed");
}

export async function runFileImportWithGuard(
  importRecordId: string,
  file: CanvasFile,
  opts: FileImportOptions,
) {
  // Start supervision only after the task gets a limiter slot. A Promise.race
  // timeout cannot abort PDF parsing or a storage write, and releasing the
  // limiter while that work continues would create a zombie owner. Keep the
  // lease alive instead; a timeout is an operator warning, not a false
  // terminal transition.
  return globalFileLimiter(async () => {
    const warning = setTimeout(() => {
      logger.warn("canvas file exceeded supervision threshold", { stage: "canvas file", durationMs: FILE_TIMEOUT_MS });
    }, FILE_TIMEOUT_MS);
    try {
      return await _runFileImport(importRecordId, file, opts);
    } finally {
      clearTimeout(warning);
    }
  });
}

export async function downloadAndStoreFile(file: CanvasFile, opts: FileImportOptions) {
  const importRecordId = uuidv4();
  try {
    await runFileImportWithGuard(importRecordId, file, opts);
  } catch (error) {
    logger.error("canvas file processing failed", { error });
    try {
      await sql`
        UPDATE app.canvas_imports
        SET status = 'error', error_message = ${errorMessage(error)}, updated_at = NOW()
        WHERE id = ${importRecordId}::uuid
          AND (${opts.jobId ?? null}::uuid IS NULL OR job_id = ${opts.jobId ?? null}::uuid)
          AND status IN ('pending', 'downloading', 'processing', 'indexing')
      `;
    } catch (dbErr) {
      logger.error("Failed to update import record:", dbErr);
    }
  }
}

// ── Job completion check ────────────────────────────────────────────────────
