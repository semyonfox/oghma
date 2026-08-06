/**
 * Canvas Import — Extraction Phase
 *
 * Handles downloading files from Canvas, dedup/claim logic, and
 * delegating to the RAG pipeline for content extraction + embedding.
 * Also houses the per-file SQS handler, direct extraction, and retry logic.
 */

import { createHash } from "node:crypto";

import sql from "../../database/pgsql.js";
import { v4 as uuidv4 } from "uuid";
import { getStorageProvider } from "../storage/init.ts";
import { addNoteToTree } from "../notes/storage/pg-tree.js";
import { CanvasClient, MAX_CANVAS_FILE_BYTES } from "./client.js";
import {
  canvasIdForBigintColumn,
  canvasModuleIdForBigintColumn,
} from "./id.js";
import { createAsyncLimiter } from "./async-limiter.js";
import { parseEnvConcurrency } from "./import-metrics.js";
import { processRagPipeline } from "./import-embedding.js";
import { decrypt } from "../crypto.ts";
import logger from "../logger.ts";
import { sanitizePostgresText } from "../text-sanitize.ts";
import { recordActivationMilestone } from "../marketing/events.ts";
import { dispatchFairCanvasFiles } from "./import-scheduler.ts";
import { enqueueExtractionRetry } from "./extraction-retry.ts";
import {
  cloneImportedPdfCacheToNote,
  canvasFileSource,
  captureImportedPdfCache,
  ensureImportedFileCacheRow,
  getImportedFileCacheBySha,
  getImportedFileCacheByCanvasSource,
  importedFileStorageKey,
  markImportedFileCacheFailed,
  recordImportedFileCanvasSource,
  sha256Hex,
  withImportedFileLock,
} from "./import-cache.ts";

// ── Constants ───────────────────────────────────────────────────────────────

export const PROCESSABLE_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "text/markdown",
  "text/x-markdown",
  "text/plain",
]);

const EXT_MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
  md: "text/markdown",
  markdown: "text/markdown",
  txt: "text/plain",
};

export const FILE_TIMEOUT_MS = Math.max(
  60_000,
  Number.parseInt(process.env.CANVAS_FILE_TIMEOUT_MS ?? "", 10) ||
    10 * 60 * 1000,
);
export const FILE_CONCURRENCY = 5;

// ── Concurrency limiters ────────────────────────────────────────────────────

const CANVAS_GLOBAL_FILE_CONCURRENCY = parseEnvConcurrency(
  "CANVAS_GLOBAL_FILE_CONCURRENCY",
  6,
);

const globalFileLimiter = createAsyncLimiter(CANVAS_GLOBAL_FILE_CONCURRENCY);

// ── MIME type resolution ────────────────────────────────────────────────────

export function resolveMimeType(filename, canvasMimeType) {
  if (canvasMimeType && PROCESSABLE_TYPES.has(canvasMimeType))
    return canvasMimeType;
  const ext = filename?.toLowerCase().split(".").pop();
  if (ext && EXT_MIME[ext]) return EXT_MIME[ext];
  return canvasMimeType;
}

// ── Note helpers ────────────────────────────────────────────────────────────

async function createNote(userId, title, parentId, opts = {}) {
  const noteId = uuidv4();
  const s3Key = opts.s3Key ?? null;
  const isFolder = opts.isFolder ?? false;
  const content = opts.content ?? "";
  const canvasCourseId = opts.canvasCourseId ?? null;
  const canvasModuleId = opts.canvasModuleId ?? null;
  const canvasAssignmentId = opts.canvasAssignmentId ?? null;
  const canvasAcademicYear = opts.canvasAcademicYear ?? null;
  await sql`
    INSERT INTO app.notes (
      note_id, user_id, title, content, s3_key, is_folder,
      canvas_course_id, canvas_module_id, canvas_assignment_id, canvas_academic_year,
      created_at, updated_at
    )
    VALUES (
      ${noteId}::uuid, ${userId}::uuid, ${title}, ${content}, ${s3Key}, ${isFolder},
      ${canvasCourseId}, ${canvasModuleId}, ${canvasAssignmentId}, ${canvasAcademicYear},
      NOW(), NOW()
    )
  `;
  await addNoteToTree(userId, noteId, parentId ?? null);
  return noteId;
}

// find an existing note by title under a parent, or create a new one
// handles concurrent inserts by catching unique-violation and re-fetching
async function findOrCreateNote(userId, title, parentId, opts = {}) {
  // SQL `= NULL` is always unknown -- split query for null vs non-null parent
  const existing = parentId
    ? await sql`
        SELECT n.note_id FROM app.notes n
        JOIN app.tree_items t ON t.note_id = n.note_id
        WHERE n.user_id = ${userId}::uuid
          AND t.user_id = ${userId}::uuid
          AND n.title = ${title}
          AND n.is_folder = false
          AND n.deleted_at IS NULL
          AND t.parent_id = ${parentId}::uuid
        LIMIT 1
      `
    : await sql`
        SELECT n.note_id FROM app.notes n
        JOIN app.tree_items t ON t.note_id = n.note_id
        WHERE n.user_id = ${userId}::uuid
          AND t.user_id = ${userId}::uuid
          AND n.title = ${title}
          AND n.is_folder = false
          AND n.deleted_at IS NULL
          AND t.parent_id IS NULL
        LIMIT 1
      `;
  if (existing.length > 0) {
    const noteId = existing[0].note_id;
    // backfill canvas metadata on re-import if not already set
    if (opts.canvasCourseId != null) {
      await sql`
        UPDATE app.notes
        SET canvas_course_id    = COALESCE(canvas_course_id,    ${opts.canvasCourseId}),
            canvas_module_id    = COALESCE(canvas_module_id,    ${opts.canvasModuleId ?? null}),
            canvas_assignment_id = COALESCE(canvas_assignment_id, ${opts.canvasAssignmentId ?? null}),
            updated_at          = NOW()
        WHERE note_id = ${noteId}::uuid AND canvas_course_id IS NULL
      `;
    }
    return { noteId, created: false };
  }
  try {
    const noteId = await createNote(userId, title, parentId, opts);
    return { noteId, created: true };
  } catch (err) {
    // concurrent insert won the race -- re-fetch the winner
    if (err.code === "23505") {
      const [row] = parentId
        ? await sql`
            SELECT n.note_id FROM app.notes n
            JOIN app.tree_items t ON t.note_id = n.note_id
            WHERE n.user_id = ${userId}::uuid
              AND t.user_id = ${userId}::uuid
              AND n.title = ${title}
              AND n.is_folder = false
              AND n.deleted_at IS NULL
              AND t.parent_id = ${parentId}::uuid
            LIMIT 1
          `
        : await sql`
            SELECT n.note_id FROM app.notes n
            JOIN app.tree_items t ON t.note_id = n.note_id
            WHERE n.user_id = ${userId}::uuid
              AND t.user_id = ${userId}::uuid
              AND n.title = ${title}
              AND n.is_folder = false
              AND n.deleted_at IS NULL
              AND t.parent_id IS NULL
            LIMIT 1
          `;
      if (row) return { noteId: row.note_id, created: false };
    }
    throw err;
  }
}

// ── Import record helpers ───────────────────────────────────────────────────

export async function fetchResource(
  fetchFn,
  courseId,
  userId,
  courseTitle,
  kind,
  jobId,
) {
  const { data, forbidden, error } = await fetchFn(courseId);
  if (forbidden) {
    const canvasCourseId = canvasIdForBigintColumn(
      courseId,
      "Canvas course ID",
    );
    console.log(`Course ${kind} restricted: ${courseTitle}`);
    // A Canvas resource restriction is represented as a synthetic per-course
    // file row so it participates in job progress. Do not use a constant 0:
    // canvas_imports is unique per user/file and a second restriction would
    // otherwise abort discovery.
    const digest = createHash("sha256")
      .update(`canvas-restriction:${courseId}:${kind}`)
      .digest();
    const magnitude = digest.readBigUInt64BE(0) & ((1n << 63n) - 1n);
    const syntheticFileId = `-${magnitude === 0n ? 1n : magnitude}`;
    await sql`
      INSERT INTO app.canvas_imports (id, user_id, canvas_course_id, canvas_module_id, canvas_file_id, filename, mime_type, status, error_message, job_id)
      VALUES (${uuidv4()}::uuid, ${userId}::uuid, ${canvasCourseId}::bigint, 0, ${syntheticFileId}::bigint, ${courseTitle + " (" + kind + ")"}, 'text/plain', 'forbidden', ${"Course " + kind + " restricted by lecturer"}, ${jobId}::uuid)
      ON CONFLICT (user_id, canvas_file_id)
      DO UPDATE SET
        status = 'forbidden',
        error_message = EXCLUDED.error_message,
        job_id = EXCLUDED.job_id,
        dispatched_at = NULL,
        updated_at = NOW()
    `;
  }
  // Canvas expresses a real 403 as both `forbidden` and a human-readable
  // error. It is a terminal access result, not a failed discovery request.
  if (error && !forbidden) {
    throw new Error(`Canvas ${kind} request failed: ${error}`);
  }
  return { data, forbidden };
}

async function setImportStatus(
  importRecordId,
  status,
  extra = {},
  expectedJobId = null,
) {
  // Every worker-side transition is scoped to the import generation that
  // claimed it. A delayed queue message may observe the same row after a
  // newer import has reused it; it must then become a no-op rather than
  // overwrite that newer generation.
  if (extra.noteId) {
    await sql`
      UPDATE app.canvas_imports
      SET status = ${status}, note_id = ${extra.noteId}::uuid, updated_at = NOW()
      WHERE id = ${importRecordId}::uuid
        AND (${expectedJobId ?? null}::uuid IS NULL OR job_id = ${expectedJobId ?? null}::uuid)
        AND status NOT IN ('cancelled', 'complete', 'forbidden', 'error')
    `;
  } else if (extra.message !== undefined) {
    await sql`
      UPDATE app.canvas_imports
      SET status = ${status}, error_message = ${extra.message}, updated_at = NOW()
      WHERE id = ${importRecordId}::uuid
        AND (${expectedJobId ?? null}::uuid IS NULL OR job_id = ${expectedJobId ?? null}::uuid)
        AND status NOT IN ('cancelled', 'complete', 'forbidden', 'error')
    `;
  } else {
    await sql`
      UPDATE app.canvas_imports
      SET status = ${status}, updated_at = NOW()
      WHERE id = ${importRecordId}::uuid
        AND (${expectedJobId ?? null}::uuid IS NULL OR job_id = ${expectedJobId ?? null}::uuid)
        AND status NOT IN ('cancelled', 'complete', 'forbidden', 'error')
    `;
  }
}

export async function isJobCancelled(jobId) {
  if (!jobId) return false;
  const [row] =
    await sql`SELECT status FROM app.canvas_import_jobs WHERE id = ${jobId} LIMIT 1`;
  return row?.status === "cancelled";
}

// ── RAG pipeline wrapper ────────────────────────────────────────────────────
// wraps processRagPipeline to inject findOrCreateNote (avoids circular deps)

async function runRagPipeline(noteId, userId, parentFolderId, buffer, ragOpts) {
  return processRagPipeline(
    noteId,
    userId,
    parentFolderId,
    buffer,
    ragOpts,
    findOrCreateNote,
  );
}

async function createAttachment(
  noteId,
  userId,
  filename,
  s3Key,
  mimeType,
  fileSize,
) {
  await sql`
    INSERT INTO app.attachments (id, note_id, user_id, filename, s3_key, mime_type, file_size)
    VALUES (${uuidv4()}::uuid, ${noteId}::uuid, ${userId}::uuid,
      ${filename}, ${s3Key}, ${mimeType}, ${fileSize})
    ON CONFLICT (note_id, s3_key) DO UPDATE SET
      filename = EXCLUDED.filename, mime_type = EXCLUDED.mime_type,
      file_size = EXCLUDED.file_size
  `;
}

async function reuseImportedPdfCache(cache, file, opts, importRecordId) {
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
  const binary = await findOrCreateNote(
    opts.userId,
    file.display_name,
    opts.parentFolderId,
    {
      s3Key: cache.storage_key,
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
    opts.parentFolderId,
    { content: "", canvasCourseId, canvasModuleId, canvasAssignmentId },
  );
  const chunksStored = await cloneImportedPdfCacheToNote({
    cacheId: cache.id,
    noteId: md.noteId,
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
}

async function hasReusableImportedPdfCacheObject(cache, storage, opts) {
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

async function _runFileImport(importRecordId, file, opts) {
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

  if (!PROCESSABLE_TYPES.has(resolvedMimeType)) {
    console.log(`Skipped (non-processable): ${file.display_name}`);
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
    : await sql.begin(async (tx) => {
        if (opts.jobId) {
          const [activeJob] = await tx`
            SELECT id
            FROM app.canvas_import_jobs
            WHERE id = ${opts.jobId}::uuid
              AND type = 'canvas'
              AND status = 'processing'
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
    console.log(`Already imported or pending, skipping: ${file.display_name}`);
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
    if (
      sourceCache &&
      (await hasReusableImportedPdfCacheObject(sourceCache, storage, opts))
    ) {
      logger.info("canvas-import-file-source-cache-hit", {
        jobId: opts.jobId,
        canvasFileId: file.id,
        tenant: canvasSource.tenant,
        fileSizeBytes: canvasSource.fileSize,
      });
      const reused = await reuseImportedPdfCache(
        sourceCache,
        file,
        opts,
        importRecordId,
      );
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
    console.log(`Download forbidden: ${file.display_name}`);
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

  const isCacheablePdf = resolvedMimeType === "application/pdf";
  const sha256 = isCacheablePdf ? sha256Hex(buffer) : null;
  const s3Key = isCacheablePdf
    ? importedFileStorageKey(sha256, file.filename)
    : `${s3Prefix}/${file.filename}`;
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

  if (isCacheablePdf) {
    const ragResult = await withImportedFileLock(sha256, async () => {
      const ready = await getImportedFileCacheBySha(sha256);
      if (
        ready?.status === "ready" &&
        ready.replayable &&
        (await hasReusableImportedPdfCacheObject(ready, storage, opts))
      ) {
        await recordImportedFileCanvasSource(ready.id, canvasSource);
        return reuseImportedPdfCache(ready, file, opts, importRecordId);
      }
      const cache = await ensureImportedFileCacheRow({
        sha256,
        mimeType: resolvedMimeType,
        fileSize: buffer.length,
        storageKey: s3Key,
      });
      await recordImportedFileCanvasSource(cache.id, canvasSource);
      if (await isJobCancelled(opts.jobId)) throw new Error("Job cancelled");
      await storage.putObject(s3Key, buffer, { contentType: resolvedMimeType });
      if (await isJobCancelled(opts.jobId)) throw new Error("Job cancelled");
      const { noteId } = await findOrCreateNote(
        userId,
        file.display_name,
        parentFolderId,
        { s3Key, canvasCourseId, canvasModuleId, canvasAssignmentId },
      );
      await createAttachment(
        noteId,
        userId,
        file.display_name,
        s3Key,
        resolvedMimeType,
        buffer.length,
      );
      await setImportStatus(importRecordId, "indexing", { noteId }, opts.jobId);
      await sql`UPDATE app.notes SET imported_file_cache_id = ${cache.id}::uuid
        WHERE note_id = ${noteId}::uuid`;
      await sql`UPDATE app.canvas_imports SET imported_file_cache_id = ${cache.id}::uuid
        WHERE id = ${importRecordId}::uuid
          AND (${opts.jobId ?? null}::uuid IS NULL OR job_id = ${opts.jobId ?? null}::uuid)
          AND status IN ('indexing', 'pending_marker')`;
      try {
        const result = await runRagPipeline(
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
        if (!result) {
          await markImportedFileCacheFailed(
            cache.id,
            "Extraction deferred to retry pipeline",
          );
          return null;
        }
        if (result.pendingMarker) return result;
        await captureImportedPdfCache({
          cacheId: cache.id,
          sourceNoteId: result.noteId,
        });
        return result;
      } catch (error) {
        await markImportedFileCacheFailed(
          cache.id,
          error instanceof Error ? error.message : String(error),
        );
        throw error;
      }
    });
    if (!ragResult) return;
    if (ragResult.pendingMarker) return;
    await setImportStatus(importRecordId, "complete", {
      noteId: ragResult.noteId,
    }, opts.jobId);
    return;
  }

  if (await isJobCancelled(opts.jobId)) throw new Error("Job cancelled");
  await storage.putObject(s3Key, buffer, { contentType: resolvedMimeType });
  if (await isJobCancelled(opts.jobId)) throw new Error("Job cancelled");
  const { noteId } = await findOrCreateNote(
    userId,
    file.display_name,
    parentFolderId,
    { s3Key, canvasCourseId, canvasModuleId, canvasAssignmentId },
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
    await sql`
      UPDATE app.canvas_imports
      SET status = 'cancelled', updated_at = NOW()
      WHERE id = ${importRecordId}::uuid
        AND job_id = ${opts.jobId ?? null}::uuid
        AND status NOT IN ('complete', 'forbidden', 'error', 'cancelled')
    `;
    return;
  }

  await setImportStatus(importRecordId, "complete", { noteId }, opts.jobId);
  console.log(`Processed: ${file.display_name}`);
}

async function runFileImportWithGuard(importRecordId, file, opts) {
  // Start supervision only after the task gets a limiter slot. A Promise.race
  // timeout cannot abort PDF parsing or a storage write, and releasing the
  // limiter while that work continues would create a zombie owner. Keep the
  // lease alive instead; a timeout is an operator warning, not a false
  // terminal transition.
  return globalFileLimiter(async () => {
    const heartbeatMs = Math.min(60_000, Math.max(15_000, FILE_TIMEOUT_MS / 10));
    const heartbeat = setInterval(() => {
      void sql`
        UPDATE app.canvas_imports
        SET updated_at = NOW()
        WHERE id = ${importRecordId}::uuid
          AND (${opts.jobId ?? null}::uuid IS NULL OR job_id = ${opts.jobId ?? null}::uuid)
          AND status IN ('downloading', 'processing', 'indexing')
      `.catch((error) => {
        console.warn(`Canvas file heartbeat failed (${importRecordId}):`, error);
      });
    }, heartbeatMs);
    const warning = setTimeout(() => {
      console.warn(
        `Canvas file exceeded ${Math.round(FILE_TIMEOUT_MS / 60000)} minute supervision threshold: ${file.display_name}`,
      );
    }, FILE_TIMEOUT_MS);
    try {
      return await _runFileImport(importRecordId, file, opts);
    } finally {
      clearInterval(heartbeat);
      clearTimeout(warning);
    }
  });
}

export async function downloadAndStoreFile(file, opts) {
  const importRecordId = uuidv4();
  try {
    await runFileImportWithGuard(importRecordId, file, opts);
  } catch (error) {
    console.error(`File processing error (${file.display_name}):`, error);
    try {
      await sql`
        UPDATE app.canvas_imports
        SET status = 'error', error_message = ${error.message}, updated_at = NOW()
        WHERE id = ${importRecordId}::uuid
          AND (${opts.jobId ?? null}::uuid IS NULL OR job_id = ${opts.jobId ?? null}::uuid)
          AND status IN ('pending', 'downloading', 'processing', 'indexing')
      `;
    } catch (dbErr) {
      console.error("Failed to update import record:", dbErr);
    }
  }
}

// ── Job completion check ────────────────────────────────────────────────────

// marks a job complete when all its canvas_imports rows are in terminal states.
// the count check and status update share the same transaction to avoid TOCTOU.
// pending_retry and pending_marker both remain in-flight: a Canvas import is
// complete only once a queued GPU result has been written and indexed.
export async function checkAndCompleteJob(jobId, userId) {
  // fast pre-check: skip the transaction entirely if >1 file is still in-flight
  const [{ count: pending }] = await sql`
    SELECT COUNT(*) as count FROM app.canvas_imports
    WHERE job_id = ${jobId}::uuid
      AND status NOT IN ('complete', 'forbidden', 'error', 'cancelled')
  `;
  if (parseInt(pending, 10) > 1) return false;

  let weCompleted = false;
  await sql.begin(async (tx) => {
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

  console.log(`[${new Date().toISOString()}] Job completed: ${jobId}`);

  await recordActivationMilestone("canvas_import_completed", userId).catch(
    (eventError) => {
      console.warn(
        `Failed to record Canvas completion milestone: ${eventError.message}`,
      );
    },
  );

  try {
    const chunks = await sql`
      SELECT c.id FROM app.chunks c
      JOIN app.canvas_imports ci ON ci.note_id = c.document_id
      WHERE ci.job_id = ${jobId}::uuid AND c.user_id = ${userId}::uuid
    `;
    const chunkIds = chunks.map((r) => r.id);
    if (chunkIds.length > 0) {
      const { seedQuestionsAfterImport } =
        await import("../quiz/generate-background.ts");
      const seeded = await seedQuestionsAfterImport(userId, chunkIds, 5);
      console.log(`Quiz seed: ${seeded} questions for job ${jobId}`);
    }
  } catch (seedErr) {
    console.warn(`Quiz seed failed (non-fatal): ${seedErr.message}`);
  }
  return true;
}

// ── Per-file SQS message handler ────────────────────────────────────────────

function canvasQueueAttemptLimit() {
  const configured = Number.parseInt(
    process.env.CANVAS_FILE_QUEUE_MAX_ATTEMPTS ?? "",
    10,
  );
  return Number.isFinite(configured) && configured > 0 ? configured : 3;
}

function isPermanentCanvasImportError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /CANVAS_MAX_FILE_BYTES|unsupported|Canvas credentials not found|Job cancelled/i.test(
    message,
  );
}

export async function processCanvasFile({
  importRecordId,
  jobId,
  userId,
  attempt = 0,
}) {
  const ts = () => new Date().toISOString();
  console.log(`[${ts()}] Processing canvas file: ${importRecordId}`);
  let record = null;
  let dbJobId = null;
  let dbUserId = null;
  try {
    const [row] = await sql`
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
      console.error(`[${ts()}] Import record not found: ${importRecordId}`);
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
      console.log(
        `[${ts()}] Ignoring stale canvas-file delivery for ${importRecordId}`,
      );
      return true;
    }

    // idempotency -- SQS at-least-once may redeliver
    if (
      [
        "complete",
        "forbidden",
        "error",
        "cancelled",
        "pending_retry",
        "pending_marker",
      ].includes(record.status)
    ) {
      console.log(
        `[${ts()}] Record ${importRecordId} already terminal: ${record.status}`,
      );
      return true;
    }

    // Claim exactly once from the scheduler-owned pending state. A duplicate
    // delivery sees no returned row and is safely acknowledged; a cancelled
    // or replaced job cannot satisfy the parent-job condition.
    const [claimed] = await sql`
      UPDATE app.canvas_imports AS ci
      SET status = 'downloading', updated_at = NOW()
      FROM app.canvas_import_jobs AS cij
      WHERE ci.id = ${importRecordId}::uuid
        AND ci.job_id = ${dbJobId}::uuid
        AND ci.user_id = ${dbUserId}::uuid
        AND ci.status = 'pending'
        AND cij.id = ci.job_id
        AND cij.type = 'canvas'
        AND cij.status = 'processing'
      RETURNING ci.id
    `;
    if (!claimed) {
      console.log(`[${ts()}] Record ${importRecordId} is already claimed or inactive`);
      return true;
    }

    if (!canvas_token || !canvas_domain)
      throw new Error("Canvas credentials not found");
    const plainToken = decrypt(canvas_token, dbUserId);
    const client = new CanvasClient(canvas_domain, plainToken);
    const storage = getStorageProvider();

    // re-fetch a fresh download URL -- avoids any session-tied URL expiry between phases
    const {
      data: file,
      forbidden: fileForbidden,
      error: fileError,
    } = await client.getFile(
      String(record.canvas_course_id),
      record.canvas_file_id,
    );
    if (fileForbidden) {
      await setImportStatus(importRecordId, "forbidden", {
        message: "File access denied by lecturer",
      }, dbJobId);
      await checkAndCompleteJob(dbJobId, dbUserId);
      return false;
    }
    if (fileError || !file) {
      throw new Error(
        `Canvas file metadata request failed: ${fileError ?? "empty response"}`,
      );
    }

    const storedModuleId =
      record.canvas_module_id == null
        ? null
        : String(record.canvas_module_id);
    await runFileImportWithGuard(importRecordId, file, {
      userId: dbUserId,
      courseId: String(record.canvas_course_id),
      moduleId:
        storedModuleId && storedModuleId !== "0" && storedModuleId !== "-1"
          ? storedModuleId
          : null,
      parentFolderId: record.parent_folder_id,
      client,
      storage,
      jobId: dbJobId,
      s3Prefix: record.s3_prefix,
      alreadyClaimed: true,
    });

    await checkAndCompleteJob(dbJobId, dbUserId);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[${new Date().toISOString()}] Canvas file error (${importRecordId}):`,
      message,
    );
    const retryable =
      Boolean(record && dbJobId && dbUserId) &&
      !isPermanentCanvasImportError(err) &&
      attempt + 1 < canvasQueueAttemptLimit();
    try {
      await sql`
        UPDATE app.canvas_imports
        SET status = ${retryable ? "pending" : "error"},
            error_message = ${message},
            updated_at = NOW()
        WHERE id = ${importRecordId}::uuid
          AND job_id = ${dbJobId ?? null}::uuid
          AND user_id = ${dbUserId ?? null}::uuid
          AND status IN ('downloading', 'processing', 'indexing')
      `;
    } catch {}
    if (retryable) throw err;
    if (dbJobId && dbUserId) {
      await checkAndCompleteJob(dbJobId, dbUserId);
    }
    return false;
  } finally {
    await dispatchFairCanvasFiles(1).catch((dispatchError) => {
      console.error("Failed to release next fair import file:", dispatchError);
    });
  }
}

// ── Direct extraction (from /api/upload) ────────────────────────────────────

export async function processDirectExtraction(msg) {
  const { noteId, userId, s3Key, mimeType, filename } = msg;
  const ts = () => new Date().toISOString();
  console.log(`[${ts()}] Direct extraction for note ${noteId} (${mimeType})`);

  // idempotency: skip if already done (SQS at-least-once can redeliver)
  const [existing] = await sql`
    SELECT status FROM app.ingestion_jobs
    WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
    ORDER BY created_at DESC LIMIT 1
  `;
  if (existing?.status === "done") {
    console.log(`[${ts()}] Note ${noteId} already extracted, skipping`);
    return;
  }

  await sql`
    UPDATE app.ingestion_jobs
    SET status = 'processing', updated_at = NOW()
    WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid AND status = 'pending'
  `;

  const storage = getStorageProvider();
  const objectData = await storage.getObjectAndMeta(s3Key);
  const buffer = objectData?.buffer;
  if (!buffer) {
    await sql`
      UPDATE app.ingestion_jobs
      SET status = 'failed', error = 'S3 object not found', updated_at = NOW()
      WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
    `;
    console.error(`[${ts()}] S3 object not found for note ${noteId}: ${s3Key}`);
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
        WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
      `;
      console.log(
        `[${ts()}] Extraction deferred for note ${noteId}; retry queued`,
      );
      return;
    }
    if (result.pendingMarker) {
      console.log(`[${ts()}] Marker queued for note ${noteId}`);
      return;
    }

    const chunksStored = result.chunksStored ?? 0;
    await sql`
      UPDATE app.ingestion_jobs
      SET status = 'done', chunks_stored = ${chunksStored}, error = NULL, updated_at = NOW()
      WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
    `;
    console.log(
      `[${ts()}] Direct extraction complete for note ${noteId} (${chunksStored} chunks)`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await sql`
      UPDATE app.ingestion_jobs
      SET status = 'failed', error = ${message}, updated_at = NOW()
      WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
    `;
    console.error(
      `[${ts()}] Direct extraction failed for note ${noteId}: ${message}`,
    );
  }
}

// ── Extraction retry handler ────────────────────────────────────────────────

export async function processExtractionRetry(msg) {
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
  console.log(
    `[${new Date().toISOString()}] Extraction retry for note ${noteId} (attempt ${attempt})`,
  );

  // A Canvas retry is bound to the file-row generation that produced it.
  // Messages without that identity are only retained for the independent
  // direct-extraction enrichment path; they must never claim a Canvas row.
  const [existingImport] = await sql`
    SELECT id, status, job_id, imported_file_cache_id
    FROM app.canvas_imports
    WHERE note_id = ${noteId}::uuid
      AND user_id = ${userId}::uuid
      AND (${importRecordId ?? null}::uuid IS NULL OR id = ${importRecordId ?? null}::uuid)
    LIMIT 1
  `;
  let importRow = null;
  if (existingImport) {
    if (
      !importRecordId ||
      !jobId ||
      String(existingImport.id) !== String(importRecordId) ||
      String(existingImport.job_id) !== String(jobId)
    ) {
      console.log(`Ignoring unbound or stale Canvas extraction retry for ${noteId}`);
      return;
    }
    const [claimed] = await sql`
      UPDATE app.canvas_imports AS imported
      SET status = 'indexing', error_message = NULL, updated_at = NOW()
      WHERE imported.id = ${importRecordId}::uuid
        AND imported.note_id = ${noteId}::uuid
        AND imported.user_id = ${userId}::uuid
        AND imported.job_id = ${jobId}::uuid
        AND imported.status = 'pending_retry'
        AND EXISTS (
          SELECT 1
          FROM app.canvas_import_jobs AS canvas_job
          WHERE canvas_job.id = imported.job_id
            AND canvas_job.type = 'canvas'
            AND canvas_job.status = 'processing'
        )
      RETURNING imported.id, imported.job_id, imported.imported_file_cache_id
    `;
    if (!claimed) {
      console.log(`Canvas extraction retry ${importRecordId} is already claimed or inactive`);
      return;
    }
    importRow = claimed;
  } else if (importRecordId || jobId) {
    console.log(`Ignoring stale Canvas extraction retry for missing import ${importRecordId}`);
    return;
  }

  const storage = getStorageProvider();
  const objectData = await storage.getObjectAndMeta(s3Key);
  const buffer = objectData?.buffer;

  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    if (importRow) {
      const [terminal] = await sql`
        UPDATE app.canvas_imports
        SET status = 'error', error_message = ${`S3 object missing/empty: ${s3Key}`}, updated_at = NOW()
        WHERE id = ${importRow.id}::uuid
          AND job_id = ${importRow.job_id}::uuid
          AND status = 'indexing'
        RETURNING job_id, user_id
      `;
      if (terminal?.job_id) {
        await checkAndCompleteJob(terminal.job_id, terminal.user_id);
      }
    }
    return;
  }

  try {
    await globalFileLimiter(async () => {
      // Do not Promise.race against work that cannot be aborted: that would
      // acknowledge a timeout while the original indexing keeps mutating the
      // note in the background. Keep ownership until it exits naturally.
      const warning = setTimeout(() => {
        console.warn(
          `Extraction retry exceeded ${Math.round(FILE_TIMEOUT_MS / 60000)} minute supervision threshold: ${filename}`,
        );
      }, FILE_TIMEOUT_MS);
      const heartbeat = importRow
        ? setInterval(() => {
            void sql`
              UPDATE app.canvas_imports
              SET updated_at = NOW()
              WHERE id = ${importRow.id}::uuid
                AND job_id = ${importRow.job_id}::uuid
                AND status = 'indexing'
            `.catch((heartbeatError) => {
              console.warn(`Canvas extraction retry heartbeat failed (${importRow.id}):`, heartbeatError);
            });
          }, Math.min(60_000, Math.max(15_000, FILE_TIMEOUT_MS / 10)))
        : null;
      try {
        const result = await runRagPipeline(noteId, userId, parentFolderId, buffer, {
          filename,
          mimeType,
          s3Key,
          attempt,
          jobId: importRow?.job_id ?? null,
          importRecordId: importRow?.id ?? null,
        });

        if (result?.pendingMarker) {
          return;
        }
        if (result) {
          let completed = true;
          if (importRow) {
            const [finished] = await sql`
              UPDATE app.canvas_imports
              SET status = 'complete', note_id = ${result.noteId}::uuid,
                  error_message = NULL, updated_at = NOW()
              WHERE id = ${importRow.id}::uuid
                AND job_id = ${importRow.job_id}::uuid
                AND status = 'indexing'
              RETURNING id
            `;
            completed = Boolean(finished);
          }
          if (completed && importRow?.imported_file_cache_id) {
            await captureImportedPdfCache({
              cacheId: importRow.imported_file_cache_id,
              sourceNoteId: result.noteId,
            });
          }
          if (completed) {
            await sql`
              UPDATE app.ingestion_jobs
              SET status = 'done', chunks_stored = ${result.chunksStored ?? 0}, error = NULL, updated_at = NOW()
              WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
                AND status <> 'cancelled'
            `;
          }
          if (completed && importRow?.job_id) {
            await checkAndCompleteJob(importRow.job_id, userId);
          }
        } else {
          await sql`
            UPDATE app.ingestion_jobs
            SET status = 'pending', error = 'Queued for extraction retry', updated_at = NOW()
            WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
              AND status <> 'cancelled'
          `;
        }
      } finally {
        if (heartbeat) clearInterval(heartbeat);
        clearTimeout(warning);
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    let terminal = null;
    if (importRow) {
      [terminal] = await sql`
        UPDATE app.canvas_imports
        SET status = 'error', error_message = ${message}, updated_at = NOW()
        WHERE id = ${importRow.id}::uuid
          AND job_id = ${importRow.job_id}::uuid
          AND status = 'indexing'
        RETURNING job_id, user_id
      `;
      // An enqueue failure can have already recorded the guarded terminal
      // state inside processRagPipeline. It still needs to release the parent
      // job promptly rather than waiting for the stuck-job sweep.
      if (!terminal) {
        [terminal] = await sql`
          SELECT job_id, user_id
          FROM app.canvas_imports
          WHERE id = ${importRow.id}::uuid
            AND job_id = ${importRow.job_id}::uuid
            AND status = 'error'
          LIMIT 1
        `;
      }
    }

    if (!importRow || terminal) {
      await sql`
        UPDATE app.ingestion_jobs
        SET status = 'failed', error = ${message}, updated_at = NOW()
        WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
          AND status <> 'cancelled'
      `;
    }
    if (terminal?.job_id) {
      await checkAndCompleteJob(terminal.job_id, terminal.user_id);
    }

    console.error(
      `[${new Date().toISOString()}] Extraction retry failed for note ${noteId}: ${message}`,
    );
  }
}

/**
 * Recover the narrow crash window after retry state commits but before its
 * queue message is published. Re-delivery is harmless because the consumer
 * compare-and-swaps `pending_retry` to `indexing` using this exact row/job.
 */
export async function recoverPendingExtractionRetries(limit = 50) {
  const rows = await sql`
    WITH candidates AS (
      SELECT
        imported.id,
        imported.note_id,
        imported.user_id,
        imported.job_id,
        imported.filename,
        imported.mime_type,
        imported.parent_folder_id,
        note.s3_key
      FROM app.canvas_imports AS imported
      JOIN app.canvas_import_jobs AS canvas_job
        ON canvas_job.id = imported.job_id
      JOIN app.notes AS note
        ON note.note_id = imported.note_id
      WHERE imported.status = 'pending_retry'
        AND imported.updated_at < NOW() - INTERVAL '1 minute'
        AND canvas_job.type = 'canvas'
        AND canvas_job.status = 'processing'
        AND note.s3_key IS NOT NULL
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
      imported.parent_folder_id,
      candidates.s3_key
  `;

  let enqueued = 0;
  for (const row of rows) {
    try {
      await enqueueExtractionRetry({
        noteId: row.note_id,
        userId: row.user_id,
        s3Key: row.s3_key,
        filename: row.filename,
        mimeType: row.mime_type,
        parentFolderId: row.parent_folder_id,
        attempt: 0,
        importRecordId: row.import_record_id,
        jobId: row.job_id,
      });
      enqueued += 1;
    } catch (error) {
      console.error(
        `Extraction retry recovery enqueue failed for ${row.import_record_id}:`,
        error,
      );
    }
  }
  return enqueued;
}

// ── Marker-complete handler ──────────────────────────────────────────────────

function markerCompletionMaxAttempts() {
  const configured = Number.parseInt(
    process.env.MARKER_COMPLETION_MAX_ATTEMPTS ?? "",
    10,
  );
  return Number.isFinite(configured) && configured > 0 ? configured : 3;
}

function markerErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/https?:\/\/\S+/gi, "[redacted-url]").slice(0, 1_000);
}

async function finalizeMarkerFailure(markerJob, status, message) {
  let finalized = false;
  await sql.begin(async (tx) => {
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

function startMarkerCompletionHeartbeat(markerJob) {
  const timer = setInterval(() => {
    void sql`
      UPDATE app.marker_jobs
      SET updated_at = NOW()
      WHERE callback_id = ${markerJob.callback_id}::uuid
        AND status = 'completing'
        AND completion_attempts = ${markerJob.completion_attempts}
    `.catch((error) => {
      console.warn(
        `Marker completion heartbeat failed for ${markerJob.callback_id}:`,
        error,
      );
    });
  }, 30_000);
  return timer;
}

export async function processMarkerFailed(msg) {
  const markerJobId = msg?.markerJobId;
  if (typeof markerJobId !== "string") {
    throw new Error("marker-failed is missing markerJobId");
  }

  const [markerJob] = await sql`
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

export async function processMarkerComplete(msg) {
  const markerJobId = msg?.markerJobId;
  if (typeof markerJobId !== "string") {
    throw new Error("marker-complete is missing markerJobId");
  }

  const maxAttempts = markerCompletionMaxAttempts();
  const [markerJob] = await sql`
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
    RETURNING *
  `;
  // A duplicate queue delivery, a completed job, or a currently claimed
  // continuation is already accounted for by the database state machine.
  if (!markerJob) return;

  const ts = () => new Date().toISOString();
  console.log(`[${ts()}] processMarkerComplete: marker job ${markerJobId}`);
  let heartbeat = null;

  try {
    const [markerResultModule, markerOutputModule, ocrModule] = await Promise.all([
      import("../marker-result.ts"),
      import("../marker-output.ts"),
      import("../ocr.ts"),
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
        SELECT imported_file_cache_id
        FROM app.canvas_imports
        WHERE note_id = ${markerJob.note_id}::uuid
        LIMIT 1
      `,
    ]);
    const importRow = importRows[0] ?? null;
    const [stillActive] = await sql`
      SELECT marker.callback_id
      FROM app.marker_jobs marker
      JOIN app.canvas_imports imported
        ON imported.note_id = marker.note_id
      LEFT JOIN app.canvas_import_jobs canvas_job
        ON canvas_job.id = marker.canvas_job_id
      WHERE marker.callback_id = ${markerJob.callback_id}::uuid
        AND marker.status = 'completing'
        AND marker.completion_attempts = ${markerJob.completion_attempts}
        AND imported.status = 'pending_marker'
        AND (
          marker.canvas_job_id IS NULL
          OR (canvas_job.type = 'canvas' AND canvas_job.status = 'processing')
        )
    `;
    if (!stillActive) return;
    heartbeat = startMarkerCompletionHeartbeat(markerJob);
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
    let completed = false;
    await sql.begin(async (tx) => {
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
      await tx`
        UPDATE app.canvas_imports
        SET status = 'complete', note_id = ${result.noteId}::uuid,
            error_message = NULL, updated_at = NOW()
        WHERE note_id = ${markerJob.note_id}::uuid
          AND status = 'pending_marker'
      `;
      await tx`
        UPDATE app.ingestion_jobs
        SET status = 'done', chunks_stored = ${result.chunksStored ?? 0}, error = NULL, updated_at = NOW()
        WHERE note_id = ${markerJob.note_id}::uuid
          AND user_id = ${markerJob.user_id}::uuid
        AND status NOT IN ('done', 'cancelled')
      `;
    });
    if (completed && markerJob.canvas_job_id) {
      await checkAndCompleteJob(markerJob.canvas_job_id, markerJob.user_id);
    }
    if (completed && importRow?.imported_file_cache_id) {
      await captureImportedPdfCache({
        cacheId: importRow.imported_file_cache_id,
        sourceNoteId: result.noteId,
      }).catch((cacheError) => {
        console.warn(
          `Marker cache capture failed for ${markerJob.callback_id}:`,
          cacheError,
        );
      });
    }
  } catch (error) {
    const message = markerErrorMessage(error);
    console.error(
      `[${ts()}] processMarkerComplete failed for marker job ${markerJobId}: ${message}`,
    );
    const { MarkerResultValidationError } = await import("../marker-result.ts");
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
