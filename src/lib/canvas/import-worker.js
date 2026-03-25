/**
 * Canvas Import Pipeline
 * Core file processing logic for Canvas LMS imports.
 * Exports processImportJob() for use by the worker entry point and the API route fallback.
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
import { findOrCreateFolder, cleanCourseName, ASSIGNMENTS_PARENT_MODULE_ID } from './canvas-folders.js';
import { decrypt } from '../crypto.ts';
import { extractWithMarker } from '../ocr.ts';

const PROCESSABLE_TYPES = new Set([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
    'text/markdown',
    'text/x-markdown',
    'text/plain',
]);
const FILE_TIMEOUT_MS = 2 * 60 * 1000;
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
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
};

function resolveMimeType(filename, canvasMimeType) {
  if (canvasMimeType && PROCESSABLE_TYPES.has(canvasMimeType)) return canvasMimeType;
  const ext = filename?.toLowerCase().split('.').pop();
  if (ext && EXT_MIME[ext]) return EXT_MIME[ext];
  return canvasMimeType;
}

async function createNote(userId, title, parentId, { s3Key = null, isFolder = false } = {}) {
  const noteId = uuidv4();
  await sql`
    INSERT INTO app.notes (note_id, user_id, title, content, s3_key, is_folder, deleted, created_at, updated_at)
    VALUES (${noteId}::uuid, ${userId}::uuid, ${title}, '', ${s3Key}, ${isFolder}, 0, NOW(), NOW())
  `;
  await addNoteToTree(userId, noteId, parentId ?? null);
  return noteId;
}

async function fetchResource(fetchFn, courseId, opts) {
  const { data, forbidden } = await fetchFn(courseId);
  if (forbidden) {
    console.log(`Course ${opts.kind} restricted: ${opts.courseTitle}`);
    await sql`
      INSERT INTO app.canvas_imports (id, user_id, canvas_course_id, canvas_module_id, canvas_file_id, filename, mime_type, status, error_message, job_id)
      VALUES (${uuidv4()}::uuid, ${opts.userId}::uuid, ${courseId}::int, 0, 0, ${opts.courseTitle + ' (' + opts.kind + ')'}, 'text/plain', 'forbidden', ${'Course ' + opts.kind + ' restricted by lecturer'}, ${opts.jobId}::uuid)
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

async function processRagPipeline(noteId, userId, buffer, filename, mimeType) {
  try {
    let rawText;
    let chunks;

    if (mimeType?.startsWith('text/')) {
      rawText = buffer.toString('utf-8');
      chunks = chunkText(rawText);
      console.log(`Text extract (${mimeType}): ${chunks.length} chunks for note ${noteId}`);
    } else {
      try {
        const marker = await extractWithMarker(buffer, filename ?? 'document.pdf');
        rawText = marker.text;
        chunks = marker.chunks;
        console.log(`Marker (${marker.source}): extracted ${chunks.length} chunks for note ${noteId}`);
      } catch {
        if (mimeType === 'application/pdf') {
          console.log(`Marker unavailable for note ${noteId}, falling back to pdf-parse`);
          const { PDFParse } = await import('pdf-parse');
          const parser = new PDFParse({ data: buffer });
          const result = await parser.getText();
          rawText = result.text;
          chunks = chunkText(rawText);
        } else {
          throw new Error(`Marker unavailable and no fallback for ${mimeType}`);
        }
      }
    }

    const cleanedText = processExtractedText(rawText);
    const embeddings = await embedChunks(chunks);

    await sql`
      UPDATE app.notes
      SET extracted_text = ${cleanedText}, updated_at = NOW()
      WHERE note_id = ${noteId}
    `;

    if (embeddings.length > 0) {
      const chunkValues = embeddings.map(({ chunk }) => [noteId, userId, chunk]);
      const chunkRows = await sql`
        INSERT INTO app.chunks (document_id, user_id, text)
        SELECT * FROM UNNEST(
          ${chunkValues.map(v => v[0])}::uuid[],
          ${chunkValues.map(v => v[1])}::uuid[],
          ${chunkValues.map(v => v[2])}::text[]
        ) RETURNING id
      `;
      const embValues = chunkRows.map((row, i) => [row.id, JSON.stringify(embeddings[i].vector)]);
      await sql`
        INSERT INTO app.embeddings (chunk_id, embedding)
        SELECT * FROM UNNEST(
          ${embValues.map(v => v[0])}::uuid[],
          ${embValues.map(v => v[1])}::vector[]
        )
      `;
    }

    console.log(`RAG: ${embeddings.length} chunks embedded for note ${noteId}`);
  } catch (error) {
    console.error(`RAG pipeline error for note ${noteId}:`, error);
    throw error;
  }
}

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

  const moduleIdVal = moduleId ?? -1;
  await sql`
    INSERT INTO app.canvas_imports (id, user_id, canvas_course_id, canvas_module_id, canvas_file_id, filename, mime_type, status, job_id)
    VALUES (${importRecordId}::uuid, ${userId}::uuid, ${courseId}::int, ${moduleIdVal}::int, ${file.id}::int, ${file.display_name}, ${resolvedMimeType}, 'downloading', ${opts.jobId ?? null})
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

  await sql`
    INSERT INTO app.attachments (id, note_id, user_id, filename, s3_key, mime_type, file_size)
    VALUES (${uuidv4()}::uuid, ${noteId}::uuid, ${userId}::uuid,
            ${file.display_name}, ${s3Key}, ${resolvedMimeType}, ${buffer.length})
  `;

  await processRagPipeline(noteId, userId, buffer, file.display_name, resolvedMimeType);
  await setImportStatus(importRecordId, 'complete', { noteId });
  console.log(`Processed: ${file.display_name}`);
}

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
  const { client, jobId } = ctx;
  const { data: modules } =
    await fetchResource(id => client.getModules(id), courseId, { userId, courseTitle, kind: 'modules', jobId });
  if (!modules) {
    console.warn(`No modules (or restricted) for course ${courseId}`);
    return;
  }
  await pooled(modules.map(module => async () => {
    const { data: items } = await client.getModuleItems(courseId, module.id);
    if (!items) return;
    const fileItems = items.filter(item => item.type === 'File');
    if (fileItems.length === 0) return;
    const folderId = await findOrCreateFolder(userId, module.name, courseFolderId, {
      canvasCourseId: Number(courseId), canvasModuleId: module.id,
    });
    const metaResults = await pooled(
      fileItems.map(item => async () => {
        const { data: file, forbidden: fileForbidden } = await client.getFile(courseId, item.content_id);
        if (fileForbidden || !file) { console.log(`File forbidden: ${item.title}`); return null; }
        return file;
      }),
      FILE_CONCURRENCY,
    );
    const resolved = metaResults
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value);
    const opts = {
      userId, courseId, moduleId: module.id, parentFolderId: folderId,
      client, storage: ctx.storage, jobId, s3Prefix: `canvas/${userId}/${courseId}/${module.id}`,
    };
    await pooled(resolved.map(file => () => downloadAndStoreFile(file, opts)), FILE_CONCURRENCY);
  }), FILE_CONCURRENCY);
}

async function processAssignments(courseId, userId, courseTitle, courseFolderId, ctx) {
  const { client, jobId } = ctx;
  const { data: assignments, forbidden } =
    await fetchResource(id => client.getAssignments(id), courseId, { userId, courseTitle, kind: 'assignments', jobId });
  if (forbidden || !assignments || assignments.length === 0) return;

  const assignmentsWithFiles = assignments.filter(a =>
    (a.attachments ?? []).some(att => PROCESSABLE_TYPES.has(resolveMimeType(att.display_name, att.content_type)))
  );
  if (assignmentsWithFiles.length === 0) return;

  const assignmentsFolderId = await findOrCreateFolder(userId, 'Assignments', courseFolderId, {
    canvasCourseId: Number(courseId), canvasModuleId: ASSIGNMENTS_PARENT_MODULE_ID,
  });
  await pooled(assignmentsWithFiles.map(assignment => async () => {
    const attachments = (assignment.attachments ?? []).filter(att =>
      PROCESSABLE_TYPES.has(resolveMimeType(att.display_name, att.content_type))
    );
    const assignmentFolderId = await findOrCreateFolder(userId, assignment.name, assignmentsFolderId, {
      canvasCourseId: Number(courseId), canvasAssignmentId: assignment.id,
    });
    const opts = {
      userId, courseId, moduleId: null, parentFolderId: assignmentFolderId,
      client, storage: ctx.storage, jobId, s3Prefix: `canvas/${userId}/${courseId}/assignments/${assignment.id}`,
    };
    await pooled(attachments.map(att => () => downloadAndStoreFile(att, opts)), FILE_CONCURRENCY);
  }), FILE_CONCURRENCY);
}

async function processCourse(course, userId, ctx) {
  const courseId = String(course.id);
  const { title: courseTitle, academicYear } = cleanCourseName(course.course_code, course.name, course.term);
  console.log(`Processing course: ${courseTitle}`);
  const courseFolderId = await findOrCreateFolder(userId, courseTitle, null, {
    canvasCourseId: course.id,
    canvasAcademicYear: academicYear,
  });
  await processModules(courseId, userId, courseTitle, courseFolderId, ctx);
  await processAssignments(courseId, userId, courseTitle, courseFolderId, ctx);
}

function parseJobCourses(job) {
  const raw = typeof job.course_ids === 'string' ? JSON.parse(job.course_ids) : job.course_ids;
  return raw.map(c =>
    typeof c === 'object' && c !== null
      ? { id: c.id, name: c.name ?? String(c.id), course_code: c.course_code ?? '', term: c.term ?? null }
      : { id: c, name: String(c), course_code: '', term: null }
  );
}

async function runJobPipeline(jobId, userId, courses) {
  await sql`UPDATE app.canvas_import_jobs SET status = 'processing', started_at = NOW() WHERE id = ${jobId}`;
  const [creds] = await sql`SELECT canvas_token, canvas_domain FROM app.login WHERE user_id = ${userId}`;
  if (!creds) throw new Error('User or Canvas credentials not found');
  const plainToken = decrypt(creds.canvas_token, userId);
  const client = new CanvasClient(creds.canvas_domain, plainToken);
  const storage = getStorageProvider();
  const ctx = { client, storage, jobId };
  await pooled(courses.map(course => () => processCourse(course, userId, ctx)), 3);
}

export async function processImportJob(jobId) {
  console.log(`[${new Date().toISOString()}] Processing import job: ${jobId}`);
  try {
    const [job] = await sql`SELECT * FROM app.canvas_import_jobs WHERE id = ${jobId}`;
    if (!job) { console.error(`Job not found: ${jobId}`); return false; }
    if (job.status !== 'queued' && job.status !== 'processing') {
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
