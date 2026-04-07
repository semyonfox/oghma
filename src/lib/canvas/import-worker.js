/**
 * Canvas Import Worker
 * Processes Canvas file imports in the background.
 * Run as a separate process: node -r ./instrumentation.ts src/lib/canvas/import-worker.js
 *
 * Folder hierarchy created per import:
 *   Course Name/
 *     Module Name/
 *       file.pdf
 *     Assignments/
 *       Assignment Name/
 *         attached-file.pdf
 */

import sql from "../../database/pgsql.js";
import { v4 as uuidv4 } from "uuid";
import { SQSClient, SendMessageBatchCommand } from "@aws-sdk/client-sqs";
import { CanvasClient } from "./client.js";
import { stripMarkdown } from "../strip-markdown.ts";
import { getStorageProvider } from "../storage/init.ts";
import { addNoteToTree } from "../notes/storage/pg-tree.js";
import { replaceNoteEmbeddings } from "../rag/indexing.ts";
import {
  findOrCreateFolder,
  cleanCourseName,
  ASSIGNMENTS_PARENT_MODULE_ID,
} from "./canvas-folders.js";
import { syncAssignmentMetadata } from "./sync-assignments.js";
import { decrypt } from "../crypto.ts";
import { ensureMarkerRunning } from "../marker-ec2.ts";
import { persistMarkerAssetsForNote } from "../marker-output.ts";
import {
  enqueueExtractionRetry,
  MAX_EXTRACTION_RETRIES,
} from "./extraction-retry.ts";
import { extractContentFromBuffer } from "../ingestion/extraction-core.ts";
import logger from "../logger.ts";

const PROCESSABLE_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "text/markdown",
  "text/x-markdown",
  "text/plain",
]);
const FILE_TIMEOUT_MS = Math.max(
  60_000,
  Number.parseInt(process.env.CANVAS_FILE_TIMEOUT_MS ?? "", 10) ||
    10 * 60 * 1000,
);
const FILE_CONCURRENCY = 5;

function parseEnvConcurrency(name, defaultValue) {
  const raw = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : defaultValue;
}

function parseEnvEnabled(name, defaultValue = true) {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  const value = raw.toLowerCase();
  return value !== "0" && value !== "false" && value !== "off";
}

function createAsyncLimiter(limit) {
  let active = 0;
  const queue = [];

  const next = () => {
    if (active >= limit || queue.length === 0) return;
    active += 1;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => {
        active -= 1;
        next();
      });
  };

  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
}

const CANVAS_GLOBAL_FILE_CONCURRENCY = parseEnvConcurrency(
  "CANVAS_GLOBAL_FILE_CONCURRENCY",
  6,
);
const CANVAS_OCR_CONCURRENCY = parseEnvConcurrency("CANVAS_OCR_CONCURRENCY", 2);
const CANVAS_EMBED_CONCURRENCY = parseEnvConcurrency(
  "CANVAS_EMBED_CONCURRENCY",
  3,
);
const CANVAS_PREWARM_MARKER = parseEnvEnabled("CANVAS_PREWARM_MARKER", true);

/**
 * Helper to measure and log phase timing.
 * Logs start/end of a phase with duration and metadata to CloudWatch.
 * @param {string} phase - Phase name (e.g., "discovery", "extraction", "embedding")
 * @param {string} jobId - Job ID for correlation
 * @param {Function} fn - Async function to measure
 * @param {object} metadata - Additional fields to log (fileCount, filename, etc.)
 */
async function measurePhase(phase, jobId, fn, metadata = {}) {
  const startTime = Date.now();
  try {
    logger.info("canvas-import-phase-start", {
      phase,
      jobId,
      ...metadata,
    });
    const result = await fn();
    const elapsedMs = Date.now() - startTime;
    const elapsedSecs = (elapsedMs / 1000).toFixed(2);
    logger.info("canvas-import-phase-complete", {
      phase,
      jobId,
      elapsedMs,
      elapsedSecs: parseFloat(elapsedSecs),
      ...metadata,
    });
    return result;
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    const elapsedSecs = (elapsedMs / 1000).toFixed(2);
    logger.error("canvas-import-phase-error", {
      phase,
      jobId,
      error: error.message,
      elapsedMs,
      elapsedSecs: parseFloat(elapsedSecs),
      ...metadata,
    });
    throw error;
  }
}

const globalFileLimiter = createAsyncLimiter(CANVAS_GLOBAL_FILE_CONCURRENCY);
const ocrLimiter = createAsyncLimiter(CANVAS_OCR_CONCURRENCY);
const embedLimiter = createAsyncLimiter(CANVAS_EMBED_CONCURRENCY);

async function pooled(tasks, limit) {
  const results = [];
  const executing = new Set();
  for (const task of tasks) {
    const p = task().finally(() => executing.delete(p));
    executing.add(p);
    results.push(p);
    if (executing.size >= limit) await Promise.race(executing);
  }
  return Promise.allSettled(results);
}

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

function resolveMimeType(filename, canvasMimeType) {
  if (canvasMimeType && PROCESSABLE_TYPES.has(canvasMimeType))
    return canvasMimeType;
  const ext = filename?.toLowerCase().split(".").pop();
  if (ext && EXT_MIME[ext]) return EXT_MIME[ext];
  return canvasMimeType;
}

async function createNote(userId, title, parentId, opts = {}) {
  const noteId = uuidv4();
  const s3Key = opts.s3Key ?? null;
  const isFolder = opts.isFolder ?? false;
  const content = opts.content ?? "";
  await sql`
    INSERT INTO app.notes (note_id, user_id, title, content, s3_key, is_folder, deleted, created_at, updated_at)
    VALUES (${noteId}::uuid, ${userId}::uuid, ${title}, ${content}, ${s3Key}, ${isFolder}, 0, NOW(), NOW())
  `;
  await addNoteToTree(userId, noteId, parentId ?? null);
  return noteId;
}

// find an existing note by title under a parent, or create a new one
// handles concurrent inserts by catching unique-violation and re-fetching
async function findOrCreateNote(userId, title, parentId, opts = {}) {
  const existing = await sql`
    SELECT n.note_id FROM app.notes n
    JOIN app.tree_items t ON t.note_id = n.note_id
    WHERE n.user_id = ${userId}::uuid
      AND t.user_id = ${userId}::uuid
      AND n.title = ${title}
      AND n.is_folder = false
      AND n.deleted = 0
      AND t.parent_id = ${parentId}::uuid
    LIMIT 1
  `;
  if (existing.length > 0)
    return { noteId: existing[0].note_id, created: false };
  try {
    const noteId = await createNote(userId, title, parentId, opts);
    return { noteId, created: true };
  } catch (err) {
    // concurrent insert won the race — re-fetch the winner
    if (err.code === "23505") {
      const [row] = await sql`
        SELECT n.note_id FROM app.notes n
        JOIN app.tree_items t ON t.note_id = n.note_id
        WHERE n.user_id = ${userId}::uuid
          AND t.user_id = ${userId}::uuid
          AND n.title = ${title}
          AND n.is_folder = false
          AND n.deleted = 0
          AND t.parent_id = ${parentId}::uuid
        LIMIT 1
      `;
      if (row) return { noteId: row.note_id, created: false };
    }
    throw err;
  }
}

async function fetchResource(
  fetchFn,
  courseId,
  userId,
  courseTitle,
  kind,
  jobId,
) {
  const { data, forbidden } = await fetchFn(courseId);
  if (forbidden) {
    console.log(`Course ${kind} restricted: ${courseTitle}`);
    await sql`
      INSERT INTO app.canvas_imports (id, user_id, canvas_course_id, canvas_module_id, canvas_file_id, filename, mime_type, status, error_message, job_id)
      VALUES (${uuidv4()}::uuid, ${userId}::uuid, ${courseId}::int, 0, 0, ${courseTitle + " (" + kind + ")"}, 'text/plain', 'forbidden', ${"Course " + kind + " restricted by lecturer"}, ${jobId}::uuid)
    `;
  }
  return { data, forbidden };
}

async function setImportStatus(importRecordId, status, extra = {}) {
  if (extra.noteId) {
    await sql`UPDATE app.canvas_imports SET status = ${status}, note_id = ${extra.noteId}::uuid, updated_at = NOW() WHERE id = ${importRecordId}::uuid`;
  } else if (extra.message !== undefined) {
    await sql`UPDATE app.canvas_imports SET status = ${status}, error_message = ${extra.message}, updated_at = NOW() WHERE id = ${importRecordId}::uuid`;
  } else {
    await sql`UPDATE app.canvas_imports SET status = ${status}, updated_at = NOW() WHERE id = ${importRecordId}::uuid`;
  }
}

async function queueExtractionRetry(retryOpts) {
  const { delaySeconds, queueUrl, usedFallbackQueue } =
    await enqueueExtractionRetry(retryOpts);

  console.log(
    `Queuing extraction retry for note ${retryOpts.noteId} (attempt ${retryOpts.attempt + 1}, delay ${delaySeconds}s)` +
      (usedFallbackQueue ? " via main queue fallback" : ""),
  );

  if (usedFallbackQueue) {
    console.warn(
      `SQS_EXTRACT_RETRY_QUEUE_URL not set, using fallback queue: ${queueUrl}`,
    );
  }
}

async function replaceEmbeddings(targetNoteId, userId, chunks) {
  return embedLimiter(() =>
    replaceNoteEmbeddings(targetNoteId, userId, chunks),
  );
}

async function processRagPipeline(
  noteId,
  userId,
  parentFolderId,
  buffer,
  ragOpts,
) {
  const { filename, mimeType, s3Key = null, attempt = 0, jobId } = ragOpts;
  try {
    const extractionStart = Date.now();
    const extraction = await ocrLimiter(() =>
      extractContentFromBuffer({
        buffer,
        filename: filename ?? "document.pdf",
        mimeType,
      }),
    );
    const extractionElapsedMs = Date.now() - extractionStart;

    const {
      rawText,
      chunks,
      source,
      markerImages = {},
      markerMetadata = null,
    } = extraction;
    const isText = source === "text";

    logger.info("canvas-import-file-extracted", {
      jobId,
      filename,
      source,
      chunkCount: chunks.length,
      elapsedMs: extractionElapsedMs,
      elapsedSecs: (extractionElapsedMs / 1000).toFixed(2),
    });

    if (source === "text") {
      console.log(
        `Text extract (${mimeType}): ${chunks.length} chunks for note ${noteId}`,
      );
    } else if (source === "marker") {
      console.log(`Marker: extracted ${chunks.length} chunks for note ${noteId}`);
    } else {
      console.log(
        `pdf-parse fallback: extracted ${chunks.length} chunks for note ${noteId}`,
      );
      if (attempt < MAX_EXTRACTION_RETRIES) {
        await queueExtractionRetry({
          noteId,
          userId,
          s3Key,
          filename,
          mimeType,
          parentFolderId,
          attempt,
        });
        console.log(
          `Queued Marker enrichment retry for note ${noteId} after pdf-parse fallback`,
        );
      }
    }

    if (isText) {
      const searchText = stripMarkdown(rawText);
      // text files: embed on the original note directly (no sibling needed)
      await sql`
        UPDATE app.notes
        SET extracted_text = ${searchText}, updated_at = NOW()
        WHERE note_id = ${noteId}::uuid
      `;
      const embeddingStart = Date.now();
      const count = await replaceEmbeddings(noteId, userId, chunks);
      const embeddingElapsedMs = Date.now() - embeddingStart;

      logger.info("canvas-import-file-embedded", {
        jobId,
        filename,
        chunkCount: count,
        elapsedMs: embeddingElapsedMs,
        elapsedSecs: (embeddingElapsedMs / 1000).toFixed(2),
      });

      console.log(`RAG: ${count} chunks embedded on text note ${noteId}`);
      return { noteId, chunksStored: count };
    }

    // binary files: create a sibling .md note for the extracted content
    const mdTitle = filename.replace(/\.[^.]+$/, "") + ".md";
    const { noteId: mdNoteId } = await findOrCreateNote(
      userId,
      mdTitle,
      parentFolderId,
      { content: rawText },
    );
    const storage = getStorageProvider();
    const markerAssets = await persistMarkerAssetsForNote({
      storage,
      userId,
      noteId: mdNoteId,
      markdown: rawText,
      images: markerImages,
      metadata: markerMetadata,
    });
    const finalMarkdown = markerAssets.markdown;
    const searchText = stripMarkdown(finalMarkdown);

    // stripped text for full-text search (no ### --- ** etc.)
    await sql`
      UPDATE app.notes
      SET content = ${finalMarkdown}, extracted_text = ${searchText}, updated_at = NOW()
      WHERE note_id = ${mdNoteId}::uuid
    `;

    const embeddingStart = Date.now();
    const count = await replaceEmbeddings(mdNoteId, userId, chunks);
    const embeddingElapsedMs = Date.now() - embeddingStart;

    logger.info("canvas-import-file-embedded", {
      jobId,
      filename,
      chunkCount: count,
      elapsedMs: embeddingElapsedMs,
      elapsedSecs: (embeddingElapsedMs / 1000).toFixed(2),
    });

    if (attempt > 0) {
      await sql`
        UPDATE app.canvas_imports
        SET status = 'complete', error_message = NULL, updated_at = NOW()
        WHERE note_id = ${noteId}::uuid AND status = 'pending_retry'
      `;
    }

    console.log(
      `RAG: ${count} chunks embedded on MD note ${mdNoteId} (source: ${noteId}, marker images: ${markerAssets.imageCount})`,
    );
    return { noteId: mdNoteId, chunksStored: count };
  } catch (error) {
    if (attempt < MAX_EXTRACTION_RETRIES) {
      await queueExtractionRetry({
        noteId,
        userId,
        s3Key,
        filename,
        mimeType,
        parentFolderId,
        attempt,
      });
      await sql`
        UPDATE app.canvas_imports
        SET status = 'pending_retry', error_message = ${error.message}, updated_at = NOW()
        WHERE note_id = ${noteId}::uuid
      `;
      console.log(
        `Extraction failed for note ${noteId}, queued for retry (attempt ${attempt + 1})`,
      );
      return null;
    }
    console.error(`RAG pipeline error for note ${noteId}:`, error);
    throw error;
  }
}

async function isJobCancelled(jobId) {
  if (!jobId) return false;
  const [row] =
    await sql`SELECT status FROM app.canvas_import_jobs WHERE id = ${jobId} LIMIT 1`;
  return row?.status === "cancelled";
}

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

  // atomically check dedup + claim the import slot
  const moduleIdVal = moduleId ?? -1;
  const claimed = await sql.begin(async (tx) => {
    // skip if already successfully imported, indexing, or queued for retry
    const [existing] = await tx`
        SELECT status FROM app.canvas_imports
        WHERE user_id = ${userId}::uuid AND canvas_file_id = ${file.id}::int
          AND status IN ('complete', 'indexing', 'pending_retry')
        LIMIT 1
      `;
    if (existing) return false;

    // upsert: insert new record or reclaim a stale one atomically
    await tx`
      INSERT INTO app.canvas_imports (id, user_id, canvas_course_id, canvas_module_id, canvas_file_id, filename, mime_type, status, job_id)
      VALUES (${importRecordId}::uuid, ${userId}::uuid, ${courseId}::int, ${moduleIdVal}::int, ${file.id}::int, ${file.display_name}, ${resolvedMimeType}, 'downloading', ${opts.jobId ?? null})
      ON CONFLICT (user_id, canvas_file_id)
      DO UPDATE SET status = 'downloading', job_id = ${opts.jobId ?? null},
                    filename = ${file.display_name}, mime_type = ${resolvedMimeType}, created_at = NOW()
      WHERE app.canvas_imports.status NOT IN ('complete', 'indexing', 'pending_retry')
    `;
    return true;
  });
  if (!claimed) {
    console.log(`Already imported or pending, skipping: ${file.display_name}`);
    return { skipped: true };
  }

  const downloadStart = Date.now();
  const { buffer, forbidden: dlForbidden } = await client.downloadFile(
    file.url,
  );
  const downloadElapsedMs = Date.now() - downloadStart;

  if (dlForbidden || !buffer) {
    console.log(`Download forbidden: ${file.display_name}`);
    await setImportStatus(importRecordId, "forbidden", {
      message: "File access denied by lecturer",
    });
    return;
  }

  logger.info("canvas-import-file-downloaded", {
    jobId: opts.jobId,
    filename: file.display_name,
    fileSizeBytes: buffer.length,
    elapsedMs: downloadElapsedMs,
    elapsedSecs: (downloadElapsedMs / 1000).toFixed(2),
  });

  const s3Key = `${s3Prefix}/${file.filename}`;
  await storage.putObject(s3Key, buffer, { contentType: resolvedMimeType });
  await setImportStatus(importRecordId, "processing");

  const { noteId } = await findOrCreateNote(
    userId,
    file.display_name,
    parentFolderId,
    { s3Key },
  );

  // create attachment record so the upload GET handler can verify ownership
  await sql`
    INSERT INTO app.attachments (id, note_id, user_id, filename, s3_key, mime_type, file_size)
    VALUES (${uuidv4()}::uuid, ${noteId}::uuid, ${userId}::uuid,
            ${file.display_name}, ${s3Key}, ${resolvedMimeType}, ${buffer.length})
  `;

  await setImportStatus(importRecordId, "indexing", { noteId });

  const ragStart = Date.now();
  const ragResult = await processRagPipeline(
    noteId,
    userId,
    parentFolderId,
    buffer,
    {
      filename: file.display_name,
      mimeType: resolvedMimeType,
      s3Key,
      jobId: opts.jobId,
    },
  );
  const ragElapsedMs = Date.now() - ragStart;

  if (ragResult === null) {
    return;
  }

  logger.info("canvas-import-file-processed", {
    jobId: opts.jobId,
    filename: file.display_name,
    ragElapsedMs,
    ragElapsedSecs: (ragElapsedMs / 1000).toFixed(2),
    chunksStored: ragResult.chunksStored,
  });

  if (await isJobCancelled(opts.jobId)) {
    await setImportStatus(importRecordId, "cancelled");
    return;
  }

  await setImportStatus(importRecordId, "complete", { noteId });
  console.log(`Processed: ${file.display_name}`);
}

async function downloadAndStoreFile(file, opts) {
  const importRecordId = uuidv4();
  try {
    // Start the timeout only after the task has acquired a limiter slot.
    // Otherwise long queue wait time is incorrectly counted as processing time.
    await globalFileLimiter(async () => {
      let timerId;
      const timer = new Promise((_, reject) => {
        timerId = setTimeout(
          () =>
            reject(
              new Error(
                `File timed out after ${Math.round(FILE_TIMEOUT_MS / 60000)} minutes: ${file.display_name}`,
              ),
            ),
          FILE_TIMEOUT_MS,
        );
      });

      try {
        await Promise.race([_runFileImport(importRecordId, file, opts), timer]);
      } finally {
        clearTimeout(timerId);
      }
    });
  } catch (error) {
    console.error(`File processing error (${file.display_name}):`, error);
    try {
      await sql`
        UPDATE app.canvas_imports
        SET status = 'error', error_message = ${error.message}, updated_at = NOW()
        WHERE id = ${importRecordId}::uuid
      `;
    } catch (dbErr) {
      console.error("Failed to update import record:", dbErr);
    }
  }
}

async function processModules(
  courseId,
  userId,
  courseTitle,
  courseFolderId,
  ctx,
) {
  const { client, storage, jobId } = ctx;
  const { data: modules } = await fetchResource(
    (id) => client.getModules(id),
    courseId,
    userId,
    courseTitle,
    "modules",
    jobId,
  );
  if (!modules) {
    console.warn(`No modules (or restricted) for course ${courseId}`);
    return;
  }
  await pooled(
    modules.map((module) => async () => {
      const { data: items } = await client.getModuleItems(courseId, module.id);
      if (!items) return;
      const fileItems = items.filter((item) => item.type === "File");
      if (fileItems.length === 0) return;
      const folderId = await findOrCreateFolder(
        userId,
        module.name,
        courseFolderId,
        {
          canvasCourseId: Number(courseId),
          canvasModuleId: module.id,
        },
      );
      const metaResults = await pooled(
        fileItems.map((item) => async () => {
          const { data: file, forbidden: fileForbidden } = await client.getFile(
            courseId,
            item.content_id,
          );
          if (fileForbidden || !file) {
            console.log(`File forbidden: ${item.title}`);
            return null;
          }
          return file;
        }),
        FILE_CONCURRENCY,
      );
      const resolved = metaResults
        .filter((r) => r.status === "fulfilled" && r.value)
        .map((r) => r.value);
      const opts = {
        userId,
        courseId,
        moduleId: module.id,
        parentFolderId: folderId,
        client,
        storage,
        jobId,
        s3Prefix: `canvas/${userId}/${courseId}/${module.id}`,
      };
      await pooled(
        resolved.map((file) => () => downloadAndStoreFile(file, opts)),
        FILE_CONCURRENCY,
      );
    }),
    FILE_CONCURRENCY,
  );
}

async function processAssignments(
  courseId,
  userId,
  courseTitle,
  courseFolderId,
  ctx,
) {
  const { client, storage, jobId } = ctx;
  const { data: assignments, forbidden } = await fetchResource(
    (id) => client.getAssignments(id),
    courseId,
    userId,
    courseTitle,
    "assignments",
    jobId,
  );
  if (forbidden || !assignments || assignments.length === 0) return;

  const assignmentsWithFiles = assignments.filter((a) =>
    (a.attachments ?? []).some((att) =>
      PROCESSABLE_TYPES.has(
        resolveMimeType(att.display_name, att.content_type),
      ),
    ),
  );
  if (assignmentsWithFiles.length === 0) return;

  const assignmentsFolderId = await findOrCreateFolder(
    userId,
    "Assignments",
    courseFolderId,
    {
      canvasCourseId: Number(courseId),
      canvasModuleId: ASSIGNMENTS_PARENT_MODULE_ID,
    },
  );
  await pooled(
    assignmentsWithFiles.map((assignment) => async () => {
      const attachments = (assignment.attachments ?? []).filter((att) =>
        PROCESSABLE_TYPES.has(
          resolveMimeType(att.display_name, att.content_type),
        ),
      );
      const assignmentFolderId = await findOrCreateFolder(
        userId,
        assignment.name,
        assignmentsFolderId,
        {
          canvasCourseId: Number(courseId),
          canvasAssignmentId: assignment.id,
        },
      );
      const opts = {
        userId,
        courseId,
        moduleId: null,
        parentFolderId: assignmentFolderId,
        client,
        storage,
        jobId,
        s3Prefix: `canvas/${userId}/${courseId}/assignments/${assignment.id}`,
      };
      await pooled(
        attachments.map((att) => () => downloadAndStoreFile(att, opts)),
        FILE_CONCURRENCY,
      );
    }),
    FILE_CONCURRENCY,
  );
}

async function processCourse(course, userId, ctx) {
  const courseId = String(course.id);
  const { title: courseTitle, academicYear } = cleanCourseName(
    course.course_code,
    course.name,
    course.term,
  );
  console.log(`Processing course: ${courseTitle}`);
  const courseFolderId = await findOrCreateFolder(userId, courseTitle, null, {
    canvasCourseId: course.id,
    canvasAcademicYear: academicYear,
  });
  await processModules(courseId, userId, courseTitle, courseFolderId, ctx);
  await processAssignments(courseId, userId, courseTitle, courseFolderId, ctx);

  // sync assignment metadata (titles, due dates, scores) for the tracker
  try {
    const { synced, errors } = await syncAssignmentMetadata(
      courseId,
      userId,
      courseTitle,
      ctx.client,
    );
    if (synced > 0 || errors > 0) {
      console.log(
        `[sync-assignments] course ${courseTitle}: ${synced} synced, ${errors} errors`,
      );
    }
  } catch (err) {
    console.warn(
      `[sync-assignments] skipped for course ${courseTitle}: ${err.message}`,
    );
  }
}

function parseJobCourses(job) {
  const raw =
    typeof job.course_ids === "string"
      ? JSON.parse(job.course_ids)
      : job.course_ids;
  return raw.map((c) =>
    typeof c === "object" && c !== null
      ? {
          id: c.id,
          name: c.name ?? String(c.id),
          course_code: c.course_code ?? "",
          term: c.term ?? null,
        }
      : { id: c, name: String(c), course_code: "", term: null },
  );
}

async function runJobPipeline(jobId, userId, courses) {
  await sql`UPDATE app.canvas_import_jobs SET status = 'processing', started_at = NOW() WHERE id = ${jobId}`;

  if (CANVAS_PREWARM_MARKER) {
    Promise.resolve()
      .then(() => ensureMarkerRunning())
      .then(() => {
        console.log("Marker prewarm complete");
      })
      .catch((error) => {
        console.warn(`Marker prewarm skipped: ${error.message}`);
      });
  }

  const [creds] =
    await sql`SELECT canvas_token, canvas_domain FROM app.login WHERE user_id = ${userId}`;
  if (!creds) throw new Error("User or Canvas credentials not found");
  const plainToken = decrypt(creds.canvas_token, userId);
  const client = new CanvasClient(creds.canvas_domain, plainToken);
  const storage = getStorageProvider();
  const ctx = { client, storage, jobId };
  await pooled(
    courses.map((course) => () => processCourse(course, userId, ctx)),
    3,
  );
}

// ── Job processing ────────────────────────────────────────────────────────────

export async function processImportJob(jobId) {
  console.log(`[${new Date().toISOString()}] Processing import job: ${jobId}`);
  try {
    const [job] =
      await sql`SELECT * FROM app.canvas_import_jobs WHERE id = ${jobId}`;
    if (!job) {
      console.error(`Job not found: ${jobId}`);
      return false;
    }
    if (job.status === "cancelled") {
      console.log(`Job ${jobId} was cancelled`);
      return false;
    }
    if (job.status !== "queued" && job.status !== "processing") {
      console.log(`Job ${jobId} already in terminal state: ${job.status}`);
      return false;
    }
    await runJobPipeline(jobId, job.user_id, parseJobCourses(job));

    // seed initial quiz questions from newly imported chunks (non-fatal)
    try {
      const chunks = await sql`
        SELECT c.id FROM app.chunks c
        JOIN app.canvas_imports ci ON ci.note_id = c.document_id
        WHERE ci.job_id = ${jobId}::uuid AND c.user_id = ${job.user_id}::uuid
      `;
      const chunkIds = chunks.map((r) => r.id);
      if (chunkIds.length > 0) {
        const { seedQuestionsAfterImport } =
          await import("../quiz/generate-background.ts");
        const seeded = await seedQuestionsAfterImport(job.user_id, chunkIds, 5);
        console.log(
          `Quiz seed: ${seeded} questions generated for job ${jobId}`,
        );
      }
    } catch (seedErr) {
      console.warn(`Quiz seed failed (non-fatal): ${seedErr.message}`);
    }

    await sql`UPDATE app.canvas_import_jobs SET status = 'complete', completed_at = NOW() WHERE id = ${jobId}`;
    console.log(`Job completed: ${jobId}`);
    return true;
  } catch (error) {
    console.error(`Job failed: ${jobId}`, error);
    await sql`UPDATE app.canvas_import_jobs SET status = 'failed', error_message = ${error.message}, updated_at = NOW() WHERE id = ${jobId}`;
    return false;
  }
}

// ── Two-phase import: discovery + per-file processing ─────────────────────

const _workerSqsClient = new SQSClient({ region: process.env.AWS_REGION ?? "eu-north-1" });

// batch-send per-file SQS messages (up to 10 per SendMessageBatch call)
async function sendFileMessages(records, jobId, userId) {
  const queueUrl = process.env.SQS_QUEUE_URL;
  if (!queueUrl) {
    console.warn(`[sendFileMessages] SQS_QUEUE_URL not set — ${records.length} file messages skipped`);
    return;
  }
  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10);
    await _workerSqsClient.send(
      new SendMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: batch.map((record, idx) => ({
          Id: String(idx),
          MessageBody: JSON.stringify({
            type: "canvas-file",
            importRecordId: record.id,
            jobId,
            userId,
          }),
        })),
      }),
    );
  }
}

// upsert a processable file into canvas_imports as 'pending'.
// skips non-processable mime types and files already in a terminal state.
async function insertPendingFile(userId, file, jobId, courseId, moduleId, parentFolderId, s3Prefix) {
  const resolvedMimeType = resolveMimeType(file.display_name, file.content_type);
  if (!PROCESSABLE_TYPES.has(resolvedMimeType)) return;

  const moduleIdVal = moduleId ?? -1;
  await sql`
    INSERT INTO app.canvas_imports (
      id, user_id, canvas_course_id, canvas_module_id, canvas_file_id,
      filename, mime_type, status, job_id, parent_folder_id, s3_prefix
    )
    VALUES (
      gen_random_uuid(), ${userId}::uuid, ${courseId}::int, ${moduleIdVal}::int,
      ${file.id}::int, ${file.display_name}, ${resolvedMimeType},
      'pending', ${jobId}::uuid, ${parentFolderId}::uuid, ${s3Prefix}
    )
    ON CONFLICT (user_id, canvas_file_id)
    DO UPDATE SET
      status           = 'pending',
      job_id           = EXCLUDED.job_id,
      canvas_course_id = EXCLUDED.canvas_course_id,
      canvas_module_id = EXCLUDED.canvas_module_id,
      filename         = EXCLUDED.filename,
      mime_type        = EXCLUDED.mime_type,
      parent_folder_id = EXCLUDED.parent_folder_id,
      s3_prefix        = EXCLUDED.s3_prefix,
      error_message    = NULL,
      updated_at       = NOW()
    WHERE app.canvas_imports.status NOT IN ('complete', 'indexing', 'pending_retry')
  `;
}

async function discoverModuleFiles(courseId, userId, courseTitle, courseFolderId, ctx) {
  const { client, jobId } = ctx;
  const { data: modules } = await fetchResource(
    (id) => client.getModules(id),
    courseId, userId, courseTitle, "modules", jobId,
  );
  if (!modules) return;

  await pooled(
    modules.map((module) => async () => {
      const { data: items } = await client.getModuleItems(courseId, module.id);
      if (!items) return;

      const fileItems = items.filter((item) => item.type === "File");
      if (fileItems.length === 0) return;

      // create folder now so parent_folder_id is stable before per-file processing
      const folderId = await findOrCreateFolder(userId, module.name, courseFolderId, {
        canvasCourseId: Number(courseId),
        canvasModuleId: module.id,
      });
      const s3Prefix = `canvas/${userId}/${courseId}/${module.id}`;

      await pooled(
        fileItems.map((item) => async () => {
          const { data: file, forbidden: fileForbidden } = await client.getFile(courseId, item.content_id);
          if (fileForbidden || !file) return;
          await insertPendingFile(userId, file, jobId, Number(courseId), module.id, folderId, s3Prefix);
        }),
        FILE_CONCURRENCY,
      );
    }),
    FILE_CONCURRENCY,
  );
}

async function discoverAssignmentFiles(courseId, userId, courseTitle, courseFolderId, ctx) {
  const { client, jobId } = ctx;
  const { data: assignments, forbidden } = await fetchResource(
    (id) => client.getAssignments(id),
    courseId, userId, courseTitle, "assignments", jobId,
  );
  if (forbidden || !assignments || assignments.length === 0) return;

  const assignmentsWithFiles = assignments.filter((a) =>
    (a.attachments ?? []).some((att) =>
      PROCESSABLE_TYPES.has(resolveMimeType(att.display_name, att.content_type)),
    ),
  );
  if (assignmentsWithFiles.length === 0) return;

  const assignmentsFolderId = await findOrCreateFolder(userId, "Assignments", courseFolderId, {
    canvasCourseId: Number(courseId),
    canvasModuleId: ASSIGNMENTS_PARENT_MODULE_ID,
  });

  await pooled(
    assignmentsWithFiles.map((assignment) => async () => {
      const attachments = (assignment.attachments ?? []).filter((att) =>
        PROCESSABLE_TYPES.has(resolveMimeType(att.display_name, att.content_type)),
      );
      const assignmentFolderId = await findOrCreateFolder(userId, assignment.name, assignmentsFolderId, {
        canvasCourseId: Number(courseId),
        canvasAssignmentId: assignment.id,
      });
      const s3Prefix = `canvas/${userId}/${courseId}/assignments/${assignment.id}`;
      for (const att of attachments) {
        await insertPendingFile(userId, att, jobId, Number(courseId), null, assignmentFolderId, s3Prefix);
      }
    }),
    FILE_CONCURRENCY,
  );
}

async function discoverCourse(course, userId, ctx) {
  const courseId = String(course.id);
  const { title: courseTitle, academicYear } = cleanCourseName(
    course.course_code, course.name, course.term,
  );
  console.log(`Discovering course: ${courseTitle}`);

  const courseFolderId = await findOrCreateFolder(userId, courseTitle, null, {
    canvasCourseId: course.id,
    canvasAcademicYear: academicYear,
  });

  await discoverModuleFiles(courseId, userId, courseTitle, courseFolderId, ctx);
  await discoverAssignmentFiles(courseId, userId, courseTitle, courseFolderId, ctx);

  try {
    const { synced, errors } = await syncAssignmentMetadata(courseId, userId, courseTitle, ctx.client);
    if (synced > 0 || errors > 0) {
      console.log(`[sync-assignments] course ${courseTitle}: ${synced} synced, ${errors} errors`);
    }
  } catch (err) {
    console.warn(`[sync-assignments] skipped for course ${courseTitle}: ${err.message}`);
  }
}

// marks a job complete when all its canvas_imports rows are in terminal states.
// the count check and status update share the same transaction to avoid TOCTOU.
// pending_retry counts as in-flight since the retry queue will eventually resolve it.
async function checkAndCompleteJob(jobId, userId) {
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
      WHERE id = ${jobId}::uuid AND status = 'processing'
      FOR UPDATE SKIP LOCKED
    `;
    if (rows.length === 0) return;
    await tx`UPDATE app.canvas_import_jobs SET status = 'complete', completed_at = NOW() WHERE id = ${jobId}`;
    weCompleted = true;
  });

  if (!weCompleted) return;

  console.log(`[${new Date().toISOString()}] Job completed: ${jobId}`);
  try {
    const chunks = await sql`
      SELECT c.id FROM app.chunks c
      JOIN app.canvas_imports ci ON ci.note_id = c.document_id
      WHERE ci.job_id = ${jobId}::uuid AND c.user_id = ${userId}::uuid
    `;
    const chunkIds = chunks.map((r) => r.id);
    if (chunkIds.length > 0) {
      const { seedQuestionsAfterImport } = await import("../quiz/generate-background.ts");
      const seeded = await seedQuestionsAfterImport(userId, chunkIds, 5);
      console.log(`Quiz seed: ${seeded} questions for job ${jobId}`);
    }
  } catch (seedErr) {
    console.warn(`Quiz seed failed (non-fatal): ${seedErr.message}`);
  }
}

export async function processDiscoverJob(jobId) {
  console.log(`[${new Date().toISOString()}] Starting discovery for job: ${jobId}`);
  try {
    const [job] = await sql`SELECT * FROM app.canvas_import_jobs WHERE id = ${jobId}`;
    if (!job) { console.error(`Job not found: ${jobId}`); return false; }
    if (job.status === "cancelled") { console.log(`Job ${jobId} cancelled`); return false; }
    if (!["queued", "discovering"].includes(job.status)) {
      console.log(`Job ${jobId} is ${job.status}, skipping discovery`);
      return false;
    }

    // COALESCE preserves the original started_at when recovering a discovering orphan
    await sql`
      UPDATE app.canvas_import_jobs
      SET status = 'discovering', started_at = COALESCE(started_at, NOW())
      WHERE id = ${jobId}
    `;

    const [creds] = await sql`SELECT canvas_token, canvas_domain FROM app.login WHERE user_id = ${job.user_id}`;
    if (!creds) throw new Error("Canvas credentials not found");
    const plainToken = decrypt(creds.canvas_token, job.user_id);
    const client = new CanvasClient(creds.canvas_domain, plainToken);

    await pooled(
      parseJobCourses(job).map((course) => () => discoverCourse(course, job.user_id, { client, jobId })),
      3,
    );

    if (await isJobCancelled(jobId)) {
      console.log(`Job ${jobId} cancelled during discovery`);
      return false;
    }

    // count every canvas_imports row for this job (pending + forbidden from course restrictions)
    const [{ count }] = await sql`SELECT COUNT(*) as count FROM app.canvas_imports WHERE job_id = ${jobId}::uuid`;
    const total = parseInt(count, 10);

    await sql`UPDATE app.canvas_import_jobs SET status = 'processing', expected_total = ${total} WHERE id = ${jobId}`;

    if (total === 0) {
      await sql`UPDATE app.canvas_import_jobs SET status = 'complete', completed_at = NOW() WHERE id = ${jobId}`;
      console.log(`Job ${jobId}: no processable files found, completed immediately`);
      return true;
    }

    const pendingRecords = await sql`
      SELECT id FROM app.canvas_imports WHERE job_id = ${jobId}::uuid AND status = 'pending'
    `;
    await sendFileMessages(pendingRecords, jobId, job.user_id);

    if (CANVAS_PREWARM_MARKER) {
      Promise.resolve()
        .then(() => ensureMarkerRunning())
        .then(() => console.log("Marker prewarm complete"))
        .catch((err) => console.warn(`Marker prewarm skipped: ${err.message}`));
    }

    const startTime = job.started_at ? new Date(job.started_at) : new Date();
    const elapsedMs = Date.now() - startTime.getTime();
    const elapsedSecs = (elapsedMs / 1000).toFixed(2);

    logger.info("canvas-import-discovery-complete", {
      jobId,
      totalFiles: total,
      pendingFiles: pendingRecords.length,
      elapsedMs,
      elapsedSecs: parseFloat(elapsedSecs),
      userId: job.user_id,
    });

    console.log(
      `[${new Date().toISOString()}] Discovery done: ${total} total, ${pendingRecords.length} queued for job ${jobId}`,
    );
    return true;
  } catch (error) {
    console.error(`Discovery failed: ${jobId}`, error);
    logger.error("canvas-import-discovery-error", {
      jobId,
      error: error.message,
    });
    await sql`
      UPDATE app.canvas_import_jobs SET status = 'failed', error_message = ${error.message}, updated_at = NOW()
      WHERE id = ${jobId}
    `;
    return false;
  }
}

export async function processCanvasFile({ importRecordId, jobId, userId }) {
  const ts = () => new Date().toISOString();
  console.log(`[${ts()}] Processing canvas file: ${importRecordId}`);
  try {
    const [record] = await sql`SELECT * FROM app.canvas_imports WHERE id = ${importRecordId}::uuid`;
    if (!record) {
      console.error(`[${ts()}] Import record not found: ${importRecordId}`);
      return false;
    }

    // idempotency — SQS at-least-once may redeliver
    if (["complete", "forbidden", "error", "cancelled", "pending_retry"].includes(record.status)) {
      console.log(`[${ts()}] Record ${importRecordId} already terminal: ${record.status}`);
      return true;
    }

    if (await isJobCancelled(jobId)) {
      await sql`UPDATE app.canvas_imports SET status = 'cancelled', updated_at = NOW() WHERE id = ${importRecordId}::uuid`;
      await checkAndCompleteJob(jobId, userId);
      return false;
    }

    const [creds] = await sql`SELECT canvas_token, canvas_domain FROM app.login WHERE user_id = ${userId}`;
    if (!creds) throw new Error("Canvas credentials not found");
    const plainToken = decrypt(creds.canvas_token, userId);
    const client = new CanvasClient(creds.canvas_domain, plainToken);
    const storage = getStorageProvider();

    // re-fetch a fresh download URL — avoids any session-tied URL expiry between phases
    const { data: file, forbidden: fileForbidden } = await client.getFile(
      String(record.canvas_course_id),
      record.canvas_file_id,
    );
    if (fileForbidden || !file) {
      await setImportStatus(importRecordId, "forbidden", { message: "File access denied by lecturer" });
      await checkAndCompleteJob(jobId, userId);
      return false;
    }

    await _runFileImport(importRecordId, file, {
      userId,
      courseId: String(record.canvas_course_id),
      moduleId: record.canvas_module_id > 0 ? record.canvas_module_id : null,
      parentFolderId: record.parent_folder_id,
      client,
      storage,
      jobId,
      s3Prefix: record.s3_prefix,
    });

    await checkAndCompleteJob(jobId, userId);
    return true;
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Canvas file error (${importRecordId}):`, err.message);
    try {
      await sql`
        UPDATE app.canvas_imports
        SET status = 'error', error_message = ${err.message}, updated_at = NOW()
        WHERE id = ${importRecordId}::uuid
          AND status NOT IN ('complete', 'forbidden', 'cancelled')
      `;
    } catch {}
    await checkAndCompleteJob(jobId, userId);
    return false;
  }
}

// processes a direct file upload extraction job — queued by /api/upload
// downloads from S3, runs the full RAG pipeline, updates ingestion_jobs status
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
  const buffer = await storage.getObject(s3Key);
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

    const result = await processRagPipeline(
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

// retries a failed extraction — called from the worker when consuming the retry queue
export async function processExtractionRetry(msg) {
  const { noteId, userId, s3Key, filename, mimeType, parentFolderId, attempt } =
    msg;
  console.log(
    `[${new Date().toISOString()}] Extraction retry for note ${noteId} (attempt ${attempt})`,
  );

  // For retry messages we still allow processing even when already complete,
  // because retries can be used for enrichment/replacement after fallback text.
  const [importRow] = await sql`
    SELECT status FROM app.canvas_imports WHERE note_id = ${noteId}::uuid LIMIT 1
  `;
  if (importRow?.status === "complete" && (attempt ?? 0) <= 0) {
    console.log(`Note ${noteId} already complete, skipping duplicate retry`);
    return;
  }

  const storage = getStorageProvider();
  const objectData = await storage.getObjectAndMeta(s3Key);
  const buffer = objectData?.buffer;

  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    await sql`
      UPDATE app.canvas_imports
      SET status = 'error', error_message = ${`S3 object missing/empty: ${s3Key}`}, updated_at = NOW()
      WHERE note_id = ${noteId}::uuid
    `;
    return;
  }

  try {
    const result = await processRagPipeline(noteId, userId, parentFolderId, buffer, {
      filename,
      mimeType,
      s3Key,
      attempt,
    });

    if (result) {
      await sql`
        UPDATE app.ingestion_jobs
        SET status = 'done', chunks_stored = ${result.chunksStored ?? 0}, error = NULL, updated_at = NOW()
        WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
      `;
    } else {
      await sql`
        UPDATE app.ingestion_jobs
        SET status = 'pending', error = 'Queued for extraction retry', updated_at = NOW()
        WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
      `;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await sql`
      UPDATE app.canvas_imports
      SET status = 'error', error_message = ${message}, updated_at = NOW()
      WHERE note_id = ${noteId}::uuid
    `;

    await sql`
      UPDATE app.ingestion_jobs
      SET status = 'failed', error = ${message}, updated_at = NOW()
      WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
    `;

    console.error(
      `[${new Date().toISOString()}] Extraction retry failed for note ${noteId}: ${message}`,
    );
  }
}
