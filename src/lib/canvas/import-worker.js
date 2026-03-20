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

import sql from '../../database/pgsql.js';
import { v4 as uuidv4 } from 'uuid';
import { CanvasClient } from './client.js';
import { processExtractedText } from './text-processing.js';
import { chunkText } from '../chunking.ts';
import { embedChunks } from '../embeddings.ts';
import { getStorageProvider } from '../storage/init.ts';
import { addNoteToTree } from '../notes/storage/pg-tree.js';

const PROCESSABLE_TYPES = new Set(['application/pdf']);
const FILE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes per file
const STUCK_JOB_THRESHOLD = "1 hour";
const STUCK_JOB_CHECK_INTERVAL_MS = 5 * 60 * 1000;

function resolveMimeType(filename, canvasMimeType) {
  if (canvasMimeType && PROCESSABLE_TYPES.has(canvasMimeType)) return canvasMimeType;
  if (filename?.toLowerCase().endsWith('.pdf')) return 'application/pdf';
  return canvasMimeType;
}

// Single note/folder creator — s3Key=null and isFolder=true for folders.
async function createNote(userId, title, parentId, { s3Key = null, isFolder = false } = {}) {
  const noteId = uuidv4();
  await sql`
    INSERT INTO app.notes (note_id, user_id, title, content, s3_key, is_folder, deleted, created_at, updated_at)
    VALUES (${noteId}::uuid, ${userId}::uuid, ${title}, '', ${s3Key}, ${isFolder}, 0, NOW(), NOW())
  `;
  await addNoteToTree(userId, noteId, parentId ?? null);
  return noteId;
}

// Creates a folder; on failure logs a warning and returns fallback (default null).
async function tryCreateFolder(userId, title, parentId, fallback = null) {
  try {
    return await createNote(userId, title, parentId, { isFolder: true });
  } catch (err) {
    console.warn(`Failed to create folder "${title}": ${err.message}`);
    return fallback;
  }
}

// Calls fetchFn(courseId), records a forbidden sentinel if access is denied, returns { data, forbidden }.
async function fetchResource(fetchFn, courseId, userId, courseTitle, kind) {
  const { data, forbidden } = await fetchFn(courseId);
  if (forbidden) {
    console.log(`Course ${kind} restricted: ${courseTitle}`);
    await sql`
      INSERT INTO app.canvas_imports (id, user_id, canvas_course_id, canvas_module_id, canvas_file_id, filename, mime_type, status, error_message)
      VALUES (${uuidv4()}::uuid, ${userId}::uuid, ${courseId}::int, 0, 0, ${courseTitle + ' (' + kind + ')'}, 'text/plain', 'forbidden', ${'Course ' + kind + ' restricted by lecturer'})
    `;
  }
  return { data, forbidden };
}

// Updates a canvas_imports row status; pass { message } for errors or { noteId } for completion.
async function setImportStatus(importRecordId, status, extra = {}) {
  if (extra.noteId) {
    await sql`UPDATE app.canvas_imports SET status = ${status}, note_id = ${extra.noteId}::uuid, updated_at = NOW() WHERE id = ${importRecordId}::uuid`;
  } else if (extra.message !== undefined) {
    await sql`UPDATE app.canvas_imports SET status = ${status}, error_message = ${extra.message}, updated_at = NOW() WHERE id = ${importRecordId}::uuid`;
  } else {
    await sql`UPDATE app.canvas_imports SET status = ${status}, updated_at = NOW() WHERE id = ${importRecordId}::uuid`;
  }
}

async function processRagPipeline(noteId, buffer) {
  try {
    const pdfParseModule = await import('pdf-parse');
    const pdfParse = pdfParseModule.default;
    if (typeof pdfParse !== 'function') throw new Error('pdf-parse not found');

    const parsed = await pdfParse(buffer);
    const cleanedText = processExtractedText(parsed.text);
    const chunks = chunkText(cleanedText);
    const embeddings = await embedChunks(chunks);
    const documentVector = embeddings[0]?.vector ?? null;

    await sql`
      UPDATE app.notes
      SET extracted_text = ${cleanedText},
          embedding = ${documentVector ? JSON.stringify(documentVector) : null}::vector,
          updated_at = NOW()
      WHERE note_id = ${noteId}
    `;
  } catch (error) {
    // RAG failure is non-fatal — note is still usable without embeddings
    console.error(`RAG pipeline error for note ${noteId}:`, error);
  }
}

// No outer try/catch — errors propagate to the timeout race in downloadAndStoreFile.
// opts: { userId, courseId, moduleId, parentFolderId, client, storage, s3Prefix }
async function _runFileImport(importRecordId, file, opts) {
  const { userId, courseId, moduleId, parentFolderId, client, storage, s3Prefix } = opts;
  const resolvedMimeType = resolveMimeType(file.display_name, file.content_type);

  if (!PROCESSABLE_TYPES.has(resolvedMimeType)) {
    console.log(`Skipped (non-processable): ${file.display_name}`);
    return { skipped: true };
  }

  const existing = await sql`
    SELECT 1 FROM app.canvas_imports
    WHERE user_id = ${userId}::uuid AND canvas_file_id = ${file.id}::int AND status = 'complete'
    LIMIT 1
  `;
  if (existing.length > 0) {
    console.log(`Already imported, skipping: ${file.display_name}`);
    return { skipped: true };
  }

  // moduleId = -1 means "assignment file" (Canvas never issues negative module IDs)
  const moduleIdVal = moduleId ?? -1;
  await sql`
    INSERT INTO app.canvas_imports (id, user_id, canvas_course_id, canvas_module_id, canvas_file_id, filename, mime_type, status)
    VALUES (${importRecordId}::uuid, ${userId}::uuid, ${courseId}::int, ${moduleIdVal}::int, ${file.id}::int, ${file.display_name}, ${resolvedMimeType}, 'downloading')
  `;

  const { buffer, forbidden: dlForbidden } = await client.downloadFile(file.url);
  if (dlForbidden || !buffer) {
    console.log(`Download forbidden: ${file.display_name}`);
    await setImportStatus(importRecordId, 'forbidden', { message: 'File access denied by lecturer' });
    return;
  }

  const s3Key = `${s3Prefix}/${file.filename}`;
  await storage.putObject(s3Key, buffer, { contentType: resolvedMimeType });
  await setImportStatus(importRecordId, 'processing');

  const noteId = await createNote(userId, file.display_name, parentFolderId, { s3Key });
  await processRagPipeline(noteId, buffer);
  await setImportStatus(importRecordId, 'complete', { noteId });
  console.log(`Processed: ${file.display_name}`);
}

/**
 * Downloads a Canvas file, uploads to S3, creates a note, and runs the RAG pipeline.
 * Enforces a 2-minute per-file timeout. Tracks progress in app.canvas_imports.
 *
 * @param {object} file - Canvas file metadata (display_name, id, url, filename, content_type)
 * @param {object} opts - { userId, courseId, moduleId, parentFolderId, client, storage, s3Prefix }
 */
async function downloadAndStoreFile(file, opts) {
  const importRecordId = uuidv4();
  const timer = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`File timed out after 2 minutes: ${file.display_name}`)), FILE_TIMEOUT_MS)
  );
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
      console.error('Failed to update import record:', dbErr);
    }
  }
}

async function processModules(courseId, userId, courseTitle, courseFolderId, ctx) {
  const { client, storage } = ctx;
  const { data: modules } =
    await fetchResource(id => client.getModules(id), courseId, userId, courseTitle, 'modules');
  if (!modules) {
    console.warn(`No modules (or restricted) for course ${courseId}`);
    return;
  }
  const moduleFolderMap = {};
  for (const module of modules) {
    const { data: items } = await client.getModuleItems(courseId, module.id);
    if (!items) continue;
    const fileItems = items.filter(item => item.type === 'File');
    if (fileItems.length === 0) continue;
    const moduleKey = `${courseId}:${module.id}`;
    moduleFolderMap[moduleKey] ??= await tryCreateFolder(userId, module.name, courseFolderId, courseFolderId);
    for (const item of fileItems) {
      const { data: file, forbidden: fileForbidden } = await client.getFile(courseId, item.content_id);
      if (fileForbidden || !file) { console.log(`File forbidden: ${item.title}`); continue; }
      await downloadAndStoreFile(file, {
        userId, courseId, moduleId: module.id, parentFolderId: moduleFolderMap[moduleKey],
        client, storage, s3Prefix: `canvas/${userId}/${courseId}/${module.id}`,
      });
    }
  }
}

async function processAssignments(courseId, userId, courseTitle, courseFolderId, ctx) {
  const { client, storage } = ctx;
  const { data: assignments, forbidden } =
    await fetchResource(id => client.getAssignments(id), courseId, userId, courseTitle, 'assignments');
  if (forbidden || !assignments || assignments.length === 0) return;

  const assignmentsWithFiles = assignments.filter(a =>
    (a.attachments ?? []).some(att => PROCESSABLE_TYPES.has(resolveMimeType(att.display_name, att.content_type)))
  );
  if (assignmentsWithFiles.length === 0) return;

  const assignmentsFolderId = await tryCreateFolder(userId, 'Assignments', courseFolderId, courseFolderId);
  for (const assignment of assignmentsWithFiles) {
    const attachments = (assignment.attachments ?? []).filter(att =>
      PROCESSABLE_TYPES.has(resolveMimeType(att.display_name, att.content_type))
    );
    const assignmentFolderId = await tryCreateFolder(userId, assignment.name, assignmentsFolderId, assignmentsFolderId);
    for (const attachment of attachments) {
      await downloadAndStoreFile(attachment, {
        userId, courseId, moduleId: null, parentFolderId: assignmentFolderId,
        client, storage, s3Prefix: `canvas/${userId}/${courseId}/assignments/${assignment.id}`,
      });
    }
  }
}

async function processCourse(course, userId, ctx) {
  const { client, storage } = ctx;
  const courseId = String(course.id);
  const courseTitle = [course.course_code, course.name].filter(Boolean).join(' — ') || courseId;
  console.log(`Processing course: ${courseTitle}`);
  const courseFolderId = await tryCreateFolder(userId, courseTitle, null);
  await processModules(courseId, userId, courseTitle, courseFolderId, { client, storage });
  await processAssignments(courseId, userId, courseTitle, courseFolderId, { client, storage });
}

// Normalises the raw course_ids field (legacy ID array or new object array) into objects.
function parseJobCourses(job) {
  const raw = typeof job.course_ids === 'string' ? JSON.parse(job.course_ids) : job.course_ids;
  return raw.map(c =>
    typeof c === 'object' && c !== null
      ? { id: c.id, name: c.name ?? String(c.id), course_code: c.course_code ?? '' }
      : { id: c, name: String(c), course_code: '' }
  );
}

// Marks job as processing, fetches Canvas credentials, and runs the import pipeline.
async function runJobPipeline(jobId, userId, courses) {
  await sql`UPDATE app.canvas_import_jobs SET status = 'processing', started_at = NOW() WHERE id = ${jobId}`;
  const [creds] = await sql`SELECT canvas_token, canvas_domain FROM app.login WHERE user_id = ${userId}`;
  if (!creds) throw new Error('User or Canvas credentials not found');
  const client = new CanvasClient(creds.canvas_domain, creds.canvas_token);
  const storage = getStorageProvider();
  for (const course of courses) {
    await processCourse(course, userId, { client, storage });
  }
}

// ── Job processing ────────────────────────────────────────────────────────────

export async function processImportJob(jobId) {
  console.log(`[${new Date().toISOString()}] Processing import job: ${jobId}`);
  try {
    const [job] = await sql`SELECT * FROM app.canvas_import_jobs WHERE id = ${jobId}`;
    if (!job) { console.error(`Job not found: ${jobId}`); return false; }
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

// ── Worker loop ───────────────────────────────────────────────────────────────

// Resets jobs stuck in 'processing' for longer than STUCK_JOB_THRESHOLD.
async function failStuckJobs() {
  await sql`
    UPDATE app.canvas_import_jobs
    SET status = 'failed', error_message = 'Job timed out', updated_at = NOW()
    WHERE status = 'processing' AND started_at < NOW() - ${STUCK_JOB_THRESHOLD}::interval
  `;
}

let lastStuckCheck = 0;

async function runWorker() {
  console.log(`[${new Date().toISOString()}] Canvas Import Worker started`);

  while (true) {
    try {
      if (Date.now() - lastStuckCheck >= STUCK_JOB_CHECK_INTERVAL_MS) {
        await failStuckJobs();
        lastStuckCheck = Date.now();
      }

      const jobs = await sql`
        SELECT id FROM app.canvas_import_jobs
        WHERE status = 'queued'
        ORDER BY created_at ASC
        LIMIT 1
      `;

      if (jobs && jobs.length > 0) {
        await processImportJob(jobs[0].id);
      } else {
        // ~1 in 6 chance = ~every 30 seconds
        if (Math.random() < 0.17) console.log(`[${new Date().toISOString()}] Worker idle, waiting for jobs...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Worker error:`, error);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runWorker().catch(console.error);
}
