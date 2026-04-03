/**
 * Canvas Import — single-file processing pipeline.
 * Handles download, S3 upload, note creation, OCR, and embedding.
 */

import sql from "../../database/pgsql.js";
import { v4 as uuidv4 } from "uuid";
import { chunkText } from "../chunking.ts";
import { stripMarkdown } from "../strip-markdown.ts";
import { addNoteToTree } from "../notes/storage/pg-tree.js";
import { replaceNoteEmbeddings } from "../rag/indexing.ts";
import { extractWithMarker } from "../ocr.ts";
import {
  enqueueExtractionRetry,
  MAX_EXTRACTION_RETRIES,
} from "./extraction-retry.ts";
import {
  PROCESSABLE_TYPES,
  resolveMimeType,
  createAsyncLimiter,
  parseEnvConcurrency,
} from "./import-utils.js";

// ── Concurrency limiters (module-level singletons) ─────────────────────────

const CANVAS_GLOBAL_FILE_CONCURRENCY = parseEnvConcurrency(
  "CANVAS_GLOBAL_FILE_CONCURRENCY",
  6,
);
const CANVAS_OCR_CONCURRENCY = parseEnvConcurrency("CANVAS_OCR_CONCURRENCY", 2);
const CANVAS_EMBED_CONCURRENCY = parseEnvConcurrency(
  "CANVAS_EMBED_CONCURRENCY",
  3,
);

export const globalFileLimiter = createAsyncLimiter(
  CANVAS_GLOBAL_FILE_CONCURRENCY,
);
const ocrLimiter = createAsyncLimiter(CANVAS_OCR_CONCURRENCY);
const embedLimiter = createAsyncLimiter(CANVAS_EMBED_CONCURRENCY);

export const FILE_TIMEOUT_MS = Math.max(
  60_000,
  Number.parseInt(process.env.CANVAS_FILE_TIMEOUT_MS ?? "", 10) ||
    10 * 60 * 1000,
);
export const FILE_CONCURRENCY = 5;

// ── Note helpers ─────────────────────────────────────────────────────────────

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

// find existing note by title under a parent, or create; handles concurrent inserts
export async function findOrCreateNote(userId, title, parentId, opts = {}) {
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

// ── DB helpers ───────────────────────────────────────────────────────────────

export async function setImportStatus(importRecordId, status, extra = {}) {
  if (extra.noteId) {
    await sql`UPDATE app.canvas_imports SET status = ${status}, note_id = ${extra.noteId}::uuid, updated_at = NOW() WHERE id = ${importRecordId}::uuid`;
  } else if (extra.message !== undefined) {
    await sql`UPDATE app.canvas_imports SET status = ${status}, error_message = ${extra.message}, updated_at = NOW() WHERE id = ${importRecordId}::uuid`;
  } else {
    await sql`UPDATE app.canvas_imports SET status = ${status}, updated_at = NOW() WHERE id = ${importRecordId}::uuid`;
  }
}

export async function fetchResource(
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

async function isJobCancelled(jobId) {
  if (!jobId) return false;
  const [row] =
    await sql`SELECT status FROM app.canvas_import_jobs WHERE id = ${jobId} LIMIT 1`;
  return row?.status === "cancelled";
}

// ── RAG pipeline ─────────────────────────────────────────────────────────────

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

export async function processRagPipeline(
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
      rawText = buffer.toString("utf-8");
      chunks = chunkText(rawText);
      console.log(
        `Text extract (${mimeType}): ${chunks.length} chunks for note ${noteId}`,
      );
    } else {
      try {
        const marker = await ocrLimiter(() =>
          extractWithMarker(buffer, filename ?? "document.pdf"),
        );
        rawText = marker.text;
        chunks = marker.chunks;
        console.log(
          `Marker (${marker.source}): extracted ${chunks.length} chunks for note ${noteId}`,
        );
      } catch (extractErr) {
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

    // wrap embedding + storage so a failure here always transitions the record
    // out of 'indexing' — without this, a crash or unhandled rejection after OCR
    // succeeds leaves the record permanently stuck in 'indexing'
    try {
      if (isText) {
        await sql`
          UPDATE app.notes SET extracted_text = ${searchText}, updated_at = NOW()
          WHERE note_id = ${noteId}::uuid
        `;
        const count = await replaceEmbeddings(noteId, userId, chunks);
        console.log(`RAG: ${count} chunks embedded on text note ${noteId}`);
        return noteId;
      }

      // binary files: create a sibling .md note for the extracted content
      const mdTitle = filename.replace(/\.[^.]+$/, "") + ".md";
      const { noteId: mdNoteId } = await findOrCreateNote(
        userId,
        mdTitle,
        parentFolderId,
        { content: rawText },
      );

      await sql`
        UPDATE app.notes SET content = ${rawText}, extracted_text = ${searchText}, updated_at = NOW()
        WHERE note_id = ${mdNoteId}::uuid
      `;

      const count = await replaceEmbeddings(mdNoteId, userId, chunks);

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
    } catch (embedErr) {
      console.error(
        `RAG embedding/storage failed for note ${noteId}:`,
        embedErr,
      );
      // explicitly mark the import as error so the record never stays in 'indexing'
      // note: there is no watchdog for process crashes — a stuck-indexing cleanup
      // job would need to be added separately as a scheduled task
      await sql`
        UPDATE app.canvas_imports
        SET status = 'error', error_message = ${embedErr.message}, updated_at = NOW()
        WHERE note_id = ${noteId}::uuid AND status IN ('indexing', 'pending_retry')
      `;
      throw embedErr;
    }
  } catch (error) {
    console.error(`RAG pipeline error for note ${noteId}:`, error);
    throw error;
  }
}

// ── Single-file import ───────────────────────────────────────────────────────

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
    const [existing] = await tx`
      SELECT status FROM app.canvas_imports
      WHERE user_id = ${userId}::uuid AND canvas_file_id = ${file.id}::int
        AND status IN ('complete', 'indexing', 'pending_retry')
      LIMIT 1
    `;
    if (existing) return false;
    await tx`
      INSERT INTO app.canvas_imports (id, user_id, canvas_course_id, canvas_module_id, canvas_file_id, filename, mime_type, status, job_id)
      VALUES (${importRecordId}::uuid, ${userId}::uuid, ${courseId}::int, ${moduleIdVal}::int, ${file.id}::int, ${file.display_name}, ${resolvedMimeType}, 'downloading', ${opts.jobId ?? null})
      ON CONFLICT (user_id, canvas_file_id)
      DO UPDATE SET id = ${importRecordId}::uuid, status = 'downloading', job_id = ${opts.jobId ?? null},
                    filename = ${file.display_name}, mime_type = ${resolvedMimeType}, created_at = NOW()
      WHERE app.canvas_imports.status NOT IN ('complete', 'indexing', 'pending_retry')
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

  await setImportStatus(importRecordId, "indexing", { noteId });

  const ragResult = await processRagPipeline(
    noteId,
    userId,
    parentFolderId,
    buffer,
    {
      filename: file.display_name,
      mimeType: resolvedMimeType,
      s3Key,
    },
  );

  if (ragResult === null) return;

  if (await isJobCancelled(opts.jobId)) {
    await setImportStatus(importRecordId, "cancelled");
    return;
  }

  await setImportStatus(importRecordId, "complete", { noteId });
  console.log(`Processed: ${file.display_name}`);
}

export async function downloadAndStoreFile(file, opts) {
  const importRecordId = uuidv4();
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
    await globalFileLimiter(() =>
      Promise.race([_runFileImport(importRecordId, file, opts), timer]),
    );
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
