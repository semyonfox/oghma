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
import { CanvasClient } from "./client.js";
import { chunkText } from "../chunking.ts";
import { embedChunks } from "../embeddings.ts";
import { stripMarkdown } from "../strip-markdown.ts";
import { getStorageProvider } from "../storage/init.ts";
import { addNoteToTree } from "../notes/storage/pg-tree.js";
import {
  findOrCreateFolder,
  cleanCourseName,
  ASSIGNMENTS_PARENT_MODULE_ID,
} from "./canvas-folders.js";
import { syncAssignmentMetadata } from "./sync-assignments.js";
import { decrypt } from "../crypto.ts";
import { extractWithMarker } from "../ocr.ts";
import { sqsClient, getExtractRetryQueueUrl } from "../sqs.ts";
import { SendMessageCommand } from "@aws-sdk/client-sqs";

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
const FILE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes per file
const FILE_CONCURRENCY = 5;
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

// backoff delays for SQS extraction retries: 30s, 2m, 8m, 15m (SQS max)
const RETRY_DELAYS = [30, 120, 480, 900];

async function queueExtractionRetry(retryOpts) {
  const retryUrl = getExtractRetryQueueUrl();
  if (!retryUrl) {
    console.warn(
      `No extraction retry queue configured, giving up on note ${retryOpts.noteId}`,
    );
    return;
  }

  const delay =
    RETRY_DELAYS[Math.min(retryOpts.attempt, RETRY_DELAYS.length - 1)];
  console.log(
    `Queuing extraction retry for note ${retryOpts.noteId} (attempt ${retryOpts.attempt + 1}, delay ${delay}s)`,
  );

  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: retryUrl,
      DelaySeconds: delay,
      MessageBody: JSON.stringify({
        type: "extract-retry",
        ...retryOpts,
        attempt: retryOpts.attempt + 1,
      }),
    }),
  );
}

// writes chunks + embeddings to a target note, replacing any existing ones
async function writeEmbeddings(targetNoteId, userId, chunks) {
  const embeddings = await embedChunks(chunks);

  if (embeddings.length > 0) {
    const chunkValues = embeddings.map(({ chunk }) => [
      targetNoteId,
      userId,
      chunk,
    ]);
    const chunkRows = await sql`
      INSERT INTO app.chunks (document_id, user_id, text)
      SELECT * FROM UNNEST(
        ${chunkValues.map((v) => v[0])}::uuid[],
        ${chunkValues.map((v) => v[1])}::uuid[],
        ${chunkValues.map((v) => v[2])}::text[]
      ) RETURNING id
    `;
    const embValues = chunkRows.map((row, i) => [
      row.id,
      JSON.stringify(embeddings[i].vector),
    ]);
    await sql`
      INSERT INTO app.embeddings (chunk_id, embedding)
      SELECT * FROM UNNEST(
        ${embValues.map((v) => v[0])}::uuid[],
        ${embValues.map((v) => v[1])}::vector[]
      )
    `;
  }

  return embeddings.length;
}

// replaces old chunks + embeddings atomically: insert new, then delete old
// if embedding fails, old data is preserved (no data loss)
async function replaceEmbeddings(targetNoteId, userId, chunks) {
  // snapshot old chunk IDs before inserting new ones
  const oldChunks =
    await sql`SELECT id FROM app.chunks WHERE document_id = ${targetNoteId}::uuid`;
  const oldIds = oldChunks.map((r) => r.id);

  const count = await writeEmbeddings(targetNoteId, userId, chunks);

  // only delete old data after new embeddings succeed
  if (oldIds.length > 0) {
    await sql`DELETE FROM app.embeddings WHERE chunk_id = ANY(${oldIds}::uuid[])`;
    await sql`DELETE FROM app.chunks WHERE id = ANY(${oldIds}::uuid[])`;
    console.log(
      `Replaced ${oldIds.length} old chunks with ${count} new ones on note ${targetNoteId}`,
    );
  }

  return count;
}

async function processRagPipeline(
  noteId,
  userId,
  parentFolderId,
  buffer,
  ragOpts,
) {
  const { filename, mimeType, s3Key = null, attempt = 0 } = ragOpts;
  try {
    let rawText;
    let chunks;
    const isText = mimeType?.startsWith("text/");

    if (isText) {
      // text/markdown/plain: already readable, embed directly on the original note
      rawText = buffer.toString("utf-8");
      chunks = chunkText(rawText);
      console.log(
        `Text extract (${mimeType}): ${chunks.length} chunks for note ${noteId}`,
      );
    } else {
      // binary docs (PDF, DOCX, PPTX): Marker OCR extraction
      try {
        const marker = await extractWithMarker(
          buffer,
          filename ?? "document.pdf",
        );
        rawText = marker.text;
        chunks = marker.chunks;
        console.log(
          `Marker (${marker.source}): extracted ${chunks.length} chunks for note ${noteId}`,
        );
      } catch (extractErr) {
        if (attempt < RETRY_DELAYS.length) {
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
            SET status = 'pending_retry', error_message = ${extractErr.message}, updated_at = NOW()
            WHERE note_id = ${noteId}::uuid
          `;
          console.log(
            `Extraction failed for note ${noteId}, queued for retry (attempt ${attempt + 1})`,
          );
          return null;
        }
        throw new Error(
          `Extraction failed after ${attempt} retries: ${extractErr.message}`,
        );
      }
    }

    const searchText = stripMarkdown(rawText);

    if (isText) {
      // text files: embed on the original note directly (no sibling needed)
      await sql`
        UPDATE app.notes
        SET extracted_text = ${searchText}, updated_at = NOW()
        WHERE note_id = ${noteId}::uuid
      `;
      const count = await replaceEmbeddings(noteId, userId, chunks);
      console.log(`RAG: ${count} chunks embedded on text note ${noteId}`);
      return noteId;
    }

    // binary files: create a sibling .md note for the extracted content
    const mdTitle = filename.replace(/\.[^.]+$/, "") + ".md";
    const { noteId: mdNoteId, created: mdCreated } = await findOrCreateNote(
      userId,
      mdTitle,
      parentFolderId,
      { content: rawText },
    );

    // stripped text for full-text search (no ### --- ** etc.)
    await sql`
      UPDATE app.notes
      SET content = ${rawText}, extracted_text = ${searchText}, updated_at = NOW()
      WHERE note_id = ${mdNoteId}::uuid
    `;

    const count = mdCreated
      ? await writeEmbeddings(mdNoteId, userId, chunks)
      : await replaceEmbeddings(mdNoteId, userId, chunks);

    if (attempt > 0) {
      await sql`
        UPDATE app.canvas_imports
        SET status = 'complete', error_message = NULL, updated_at = NOW()
        WHERE note_id = ${noteId}::uuid AND status = 'pending_retry'
      `;
    }

    console.log(
      `RAG: ${count} chunks embedded on MD note ${mdNoteId} (source: ${noteId})`,
    );
    return mdNoteId;
  } catch (error) {
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
    // skip if already successfully imported or queued for retry
    const [existing] = await tx`
      SELECT status FROM app.canvas_imports
      WHERE user_id = ${userId}::uuid AND canvas_file_id = ${file.id}::int
        AND status IN ('complete', 'pending_retry')
      LIMIT 1
    `;
    if (existing) return false;

    // upsert: insert new record or reclaim a stale one atomically
    await tx`
      INSERT INTO app.canvas_imports (id, user_id, canvas_course_id, canvas_module_id, canvas_file_id, filename, mime_type, status, job_id)
      VALUES (${importRecordId}::uuid, ${userId}::uuid, ${courseId}::int, ${moduleIdVal}::int, ${file.id}::int, ${file.display_name}, ${resolvedMimeType}, 'downloading', ${opts.jobId ?? null})
      ON CONFLICT (user_id, canvas_file_id)
      DO UPDATE SET id = ${importRecordId}::uuid, status = 'downloading', job_id = ${opts.jobId ?? null},
                    filename = ${file.display_name}, mime_type = ${resolvedMimeType}, created_at = NOW()
      WHERE app.canvas_imports.status NOT IN ('complete', 'pending_retry')
    `;
    return true;
  });
  if (!claimed) {
    console.log(`Already imported or pending, skipping: ${file.display_name}`);
    return { skipped: true };
  }

  const { buffer, forbidden: dlForbidden } = await client.downloadFile(
    file.url,
  );
  if (dlForbidden || !buffer) {
    console.log(`Download forbidden: ${file.display_name}`);
    await setImportStatus(importRecordId, "forbidden", {
      message: "File access denied by lecturer",
    });
    return;
  }

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

  await processRagPipeline(noteId, userId, parentFolderId, buffer, {
    filename: file.display_name,
    mimeType: resolvedMimeType,
    s3Key,
  });
  await setImportStatus(importRecordId, "complete", { noteId });
  console.log(`Processed: ${file.display_name}`);
}

async function downloadAndStoreFile(file, opts) {
  const importRecordId = uuidv4();
  let timerId;
  const timer = new Promise((_, reject) => {
    timerId = setTimeout(
      () =>
        reject(
          new Error(`File timed out after 2 minutes: ${file.display_name}`),
        ),
      FILE_TIMEOUT_MS,
    );
  });
  try {
    await Promise.race([_runFileImport(importRecordId, file, opts), timer]);
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
  } finally {
    clearTimeout(timerId);
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
    await sql`UPDATE app.canvas_import_jobs SET status = 'complete', completed_at = NOW() WHERE id = ${jobId}`;
    console.log(`Job completed: ${jobId}`);
    return true;
  } catch (error) {
    console.error(`Job failed: ${jobId}`, error);
    await sql`UPDATE app.canvas_import_jobs SET status = 'failed', error_message = ${error.message}, updated_at = NOW() WHERE id = ${jobId}`;
    return false;
  }
}

// retries a failed extraction — called from the worker when consuming the retry queue
export async function processExtractionRetry(msg) {
  const { noteId, userId, s3Key, filename, mimeType, parentFolderId, attempt } =
    msg;
  console.log(
    `[${new Date().toISOString()}] Extraction retry for note ${noteId} (attempt ${attempt})`,
  );

  // idempotency: skip if already completed (SQS at-least-once can redeliver)
  const [importRow] = await sql`
    SELECT status FROM app.canvas_imports WHERE note_id = ${noteId}::uuid LIMIT 1
  `;
  if (importRow?.status === "complete") {
    console.log(`Note ${noteId} already complete, skipping duplicate retry`);
    return;
  }

  const storage = getStorageProvider();
  const buffer = await storage.getObject(s3Key);
  if (!buffer) throw new Error(`S3 object not found: ${s3Key}`);

  await processRagPipeline(noteId, userId, parentFolderId, buffer, {
    filename,
    mimeType,
    s3Key,
    attempt,
  });
}
