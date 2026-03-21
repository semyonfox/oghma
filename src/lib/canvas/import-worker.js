/**
 * Canvas Import Worker
 * Processes Canvas file imports in the background.
 * Run as a separate process: node -r ./instrumentation.ts src/lib/canvas/import-worker.js
 *
 * Folder hierarchy created per import:
 *   CT101 - Introduction to Computing/
 *     Module Name/
 *       file.pdf
 *     Assignments/
 *       Assignment Name/
 *         Instructions (markdown note)
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

// types that get text extracted + embedded for RAG
const RAG_TYPES = new Set(['application/pdf']);
// types that get a visible note in the tree (expand as viewers are added)
const VIEWABLE_TYPES = new Set(['application/pdf']);

const FILE_TIMEOUT_MS = 2 * 60 * 1000;
const FILE_CONCURRENCY = 5;

// sentinel IDs for special Canvas structures
const ASSIGNMENTS_PARENT_MODULE_ID = -1;
const FORBIDDEN_SENTINEL_ID = 0;

export async function pooled(tasks, limit) {
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

function resolveMimeType(filename, canvasMimeType) {
  if (canvasMimeType && canvasMimeType !== 'application/octet-stream') return canvasMimeType;
  if (filename?.toLowerCase().endsWith('.pdf')) return 'application/pdf';
  return canvasMimeType || 'application/octet-stream';
}

// ── Folder naming ───────────────────────────────────────────────────────────

function cleanCourseName(courseCode, courseName) {
  const codeMatch = courseCode?.match(/^(\d{4})-?(.*)/);
  const cleanCode = codeMatch?.[2] || courseCode || '';
  const academicYear = codeMatch?.[1] || null;

  let cleanName = courseName ?? '';
  if (courseCode && cleanName.startsWith(courseCode)) {
    cleanName = cleanName.slice(courseCode.length).trim();
  }
  if (cleanCode && cleanName.startsWith(cleanCode)) {
    cleanName = cleanName.slice(cleanCode.length).trim();
  }
  cleanName = cleanName.replace(/^[-—–:\s]+/, '').trim();

  const title = cleanCode && cleanName
    ? `${cleanCode} - ${cleanName}`
    : cleanCode || cleanName || 'Untitled Course';

  return { title, academicYear };
}

// ── Folder deduplication ────────────────────────────────────────────────────

// builds the WHERE clause dynamically based on which canvas IDs are present
function findCanvasFolder(userId, canvas) {
  const { canvasCourseId, canvasModuleId, canvasAssignmentId } = canvas;
  if (canvasAssignmentId != null) {
    return sql`
      SELECT note_id FROM app.notes
      WHERE user_id = ${userId}::uuid
        AND canvas_course_id = ${canvasCourseId}::int
        AND canvas_assignment_id = ${canvasAssignmentId}::int
        AND is_folder = true AND deleted = 0
      LIMIT 1
    `;
  }
  if (canvasModuleId != null) {
    return sql`
      SELECT note_id FROM app.notes
      WHERE user_id = ${userId}::uuid
        AND canvas_course_id = ${canvasCourseId}::int
        AND canvas_module_id = ${canvasModuleId}::int
        AND is_folder = true AND deleted = 0
      LIMIT 1
    `;
  }
  return sql`
    SELECT note_id FROM app.notes
    WHERE user_id = ${userId}::uuid
      AND canvas_course_id = ${canvasCourseId}::int
      AND canvas_module_id IS NULL AND canvas_assignment_id IS NULL
      AND is_folder = true AND deleted = 0
    LIMIT 1
  `;
}

async function findOrCreateFolder(userId, title, parentId, canvas = {}) {
  const { canvasCourseId, canvasAcademicYear } = canvas;

  // try to find existing folder by canvas IDs
  if (canvasCourseId != null) {
    const existing = await findCanvasFolder(userId, canvas);
    if (existing.length > 0) {
      await addNoteToTree(userId, existing[0].note_id, parentId ?? null);
      return existing[0].note_id;
    }
  }

  const noteId = uuidv4();
  try {
    await sql`
      INSERT INTO app.notes (
        note_id, user_id, title, content, is_folder, deleted,
        canvas_course_id, canvas_module_id, canvas_assignment_id, canvas_academic_year,
        created_at, updated_at
      ) VALUES (
        ${noteId}::uuid, ${userId}::uuid, ${title}, '', true, 0,
        ${canvasCourseId ?? null}, ${canvas.canvasModuleId ?? null},
        ${canvas.canvasAssignmentId ?? null}, ${canvasAcademicYear ?? null},
        NOW(), NOW()
      )
    `;
    await addNoteToTree(userId, noteId, parentId ?? null);
    return noteId;
  } catch (err) {
    // unique index conflict — concurrent worker created it first
    if (err.code === '23505' && canvasCourseId != null) {
      const winner = await findCanvasFolder(userId, canvas);
      if (winner.length > 0) {
        await addNoteToTree(userId, winner[0].note_id, parentId ?? null);
        return winner[0].note_id;
      }
    }
    console.warn(`Failed to create folder "${title}": ${err.message}`);
    return parentId;
  }
}

// ── Job cancellation ────────────────────────────────────────────────────────

async function isJobCancelled(jobId) {
  if (!jobId) return false;
  const [row] = await sql`
    SELECT status FROM app.canvas_import_jobs WHERE id = ${jobId}
  `;
  return row?.status === 'cancelled';
}

// ── Canvas resource fetching ────────────────────────────────────────────────

async function fetchResource(fetchFn, courseId, ctx) {
  const { userId, courseTitle, jobId } = ctx;
  const kind = ctx.kind;
  const { data, forbidden } = await fetchFn(courseId);
  if (forbidden) {
    console.log(`Course ${kind} restricted: ${courseTitle}`);
    await sql`
      INSERT INTO app.canvas_imports (id, user_id, canvas_course_id, canvas_module_id, canvas_file_id, filename, mime_type, status, error_message, job_id)
      VALUES (
        ${uuidv4()}::uuid, ${userId}::uuid, ${courseId}::int,
        ${FORBIDDEN_SENTINEL_ID}, ${FORBIDDEN_SENTINEL_ID},
        ${courseTitle + ' (' + kind + ')'}, 'text/plain', 'forbidden',
        ${'Course ' + kind + ' restricted by lecturer'},
        ${jobId ?? null}
      )
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

// ── RAG pipeline ────────────────────────────────────────────────────────────

async function processRagPipeline(noteId, userId, buffer) {
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();

    const cleanedText = processExtractedText(result.text);
    const chunks = chunkText(cleanedText);
    const embeddings = await embedChunks(chunks);

    await sql`
      UPDATE app.notes SET extracted_text = ${cleanedText}, updated_at = NOW()
      WHERE note_id = ${noteId}
    `;

    for (const { chunk, vector } of embeddings) {
      const [row] = await sql`
        INSERT INTO app.chunks (document_id, user_id, text)
        VALUES (${noteId}::uuid, ${userId}::uuid, ${chunk})
        RETURNING id
      `;
      await sql`
        INSERT INTO app.embeddings (chunk_id, embedding)
        VALUES (${row.id}, ${JSON.stringify(vector)}::vector)
      `;
    }
    console.log(`RAG: ${embeddings.length} chunks embedded for note ${noteId}`);
  } catch (error) {
    console.error(`RAG pipeline error for note ${noteId}:`, error);
  }
}

// ── File import ─────────────────────────────────────────────────────────────

async function createFileNote(userId, title, parentId, s3Key) {
  const noteId = uuidv4();
  await sql`
    INSERT INTO app.notes (note_id, user_id, title, content, s3_key, is_folder, deleted, created_at, updated_at)
    VALUES (${noteId}::uuid, ${userId}::uuid, ${title}, '', ${s3Key}, false, 0, NOW(), NOW())
  `;
  await addNoteToTree(userId, noteId, parentId ?? null);
  return noteId;
}

async function _runFileImport(importRecordId, file, ctx) {
  const { userId, courseId, parentFolderId, client, storage, s3Prefix, jobId } = ctx;
  const moduleId = ctx.moduleId ?? ASSIGNMENTS_PARENT_MODULE_ID;
  const resolvedMimeType = resolveMimeType(file.display_name, file.content_type);

  // dedup check
  const existing = await sql`
    SELECT 1 FROM app.canvas_imports
    WHERE user_id = ${userId}::uuid AND canvas_file_id = ${file.id}::int AND status = 'complete'
    LIMIT 1
  `;
  if (existing.length > 0) {
    console.log(`Already imported, skipping: ${file.display_name}`);
    return { skipped: true };
  }

  await sql`
    INSERT INTO app.canvas_imports (id, user_id, canvas_course_id, canvas_module_id, canvas_file_id, filename, mime_type, status, job_id)
    VALUES (${importRecordId}::uuid, ${userId}::uuid, ${courseId}::int, ${moduleId}::int, ${file.id}::int, ${file.display_name}, ${resolvedMimeType}, 'downloading', ${jobId ?? null})
  `;

  const { buffer, forbidden: dlForbidden } = await client.downloadFile(file.url);
  if (dlForbidden || !buffer) {
    console.log(`Download forbidden: ${file.display_name}`);
    await setImportStatus(importRecordId, 'forbidden', { message: 'File access denied by lecturer' });
    return;
  }

  // always store to S3
  const s3Key = `${s3Prefix}/${file.filename}`;
  await storage.putObject(s3Key, buffer, { contentType: resolvedMimeType });
  await setImportStatus(importRecordId, 'processing');

  // only create a tree note for viewable types
  if (VIEWABLE_TYPES.has(resolvedMimeType)) {
    const noteId = await createFileNote(userId, file.display_name, parentFolderId, s3Key);
    if (RAG_TYPES.has(resolvedMimeType)) {
      await processRagPipeline(noteId, userId, buffer);
    }
    await setImportStatus(importRecordId, 'complete', { noteId });
  } else {
    await setImportStatus(importRecordId, 'complete');
  }

  console.log(`Processed: ${file.display_name} (${resolvedMimeType})`);
}

async function downloadAndStoreFile(file, ctx) {
  const importRecordId = uuidv4();
  const timer = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`File timed out after 2 minutes: ${file.display_name}`)), FILE_TIMEOUT_MS)
  );
  try {
    await Promise.race([_runFileImport(importRecordId, file, ctx), timer]);
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

// ── Discovery phase ─────────────────────────────────────────────────────────

async function discoverFileCount(courses, client) {
  let total = 0;
  for (const course of courses) {
    const courseId = String(course.id);

    const { data: modules } = await client.getModules(courseId);
    if (modules) {
      for (const mod of modules) {
        const { data: items } = await client.getModuleItems(courseId, mod.id);
        if (items) total += items.filter(item => item.type === 'File').length;
      }
    }

    const { data: assignments } = await client.getAssignments(courseId);
    if (assignments) {
      for (const a of assignments) {
        const seen = new Set();
        for (const att of [...(a.attachments ?? []), ...(a.submission?.attachments ?? [])]) {
          if (!seen.has(att.id)) { seen.add(att.id); total++; }
        }
        if (a.description?.trim()) total++;
      }
    }
  }
  return total;
}

// ── Course processing ───────────────────────────────────────────────────────

function stripHtmlToText(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<h[1-6][^>]*>/gi, '## ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function processModules(courseId, courseFolderId, ctx) {
  const { client, storage, userId, courseTitle, jobId } = ctx;
  if (await isJobCancelled(jobId)) return;

  const { data: modules } = await fetchResource(
    id => client.getModules(id), courseId,
    { userId, courseTitle, jobId, kind: 'modules' },
  );
  if (!modules) return;

  await pooled(modules.map(module => async () => {
    if (await isJobCancelled(jobId)) return;

    const { data: items } = await client.getModuleItems(courseId, module.id);
    if (!items) return;
    const fileItems = items.filter(item => item.type === 'File');
    if (fileItems.length === 0) return;

    const folderId = await findOrCreateFolder(userId, module.name, courseFolderId, {
      canvasCourseId: Number(courseId), canvasModuleId: module.id,
    });

    const metaResults = await pooled(
      fileItems.map(item => async () => {
        const { data: file, forbidden } = await client.getFile(courseId, item.content_id);
        if (forbidden || !file) { console.log(`File forbidden: ${item.title}`); return null; }
        return file;
      }),
      FILE_CONCURRENCY,
    );
    const resolved = metaResults.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);

    const fileCtx = {
      userId, courseId, moduleId: module.id, parentFolderId: folderId,
      client, storage, s3Prefix: `canvas/${userId}/${courseId}/${module.id}`, jobId,
    };
    await pooled(resolved.map(file => () => downloadAndStoreFile(file, fileCtx)), FILE_CONCURRENCY);
  }), FILE_CONCURRENCY);
}

async function importAssignmentInstructions(assignment, assignmentFolderId, ctx) {
  const { userId, courseId, jobId } = ctx;
  if (!assignment.description?.trim()) return;

  const instrSentinel = -(assignment.id);
  const instrExisting = await sql`
    SELECT 1 FROM app.canvas_imports
    WHERE user_id = ${userId}::uuid AND canvas_file_id = ${instrSentinel}::int AND status = 'complete'
    LIMIT 1
  `;
  if (instrExisting.length > 0) return;

  try {
    const instrText = stripHtmlToText(assignment.description);
    const noteId = await createFileNote(userId, 'Instructions', assignmentFolderId, null);
    await sql`UPDATE app.notes SET content = ${instrText}, updated_at = NOW() WHERE note_id = ${noteId}::uuid`;
    await sql`
      INSERT INTO app.canvas_imports (id, user_id, canvas_course_id, canvas_module_id, canvas_file_id, filename, mime_type, status, note_id, job_id)
      VALUES (${uuidv4()}::uuid, ${userId}::uuid, ${courseId}::int, ${ASSIGNMENTS_PARENT_MODULE_ID}, ${instrSentinel}::int, ${assignment.name + ' (Instructions)'}, 'text/markdown', 'complete', ${noteId}::uuid, ${jobId ?? null})
    `;
    console.log(`Created instructions note for: ${assignment.name}`);
  } catch (err) {
    console.warn(`Failed to create instructions for "${assignment.name}": ${err.message}`);
  }
}

async function processAssignments(courseId, courseFolderId, ctx) {
  const { client, storage, userId, courseTitle, jobId } = ctx;
  if (await isJobCancelled(jobId)) return;

  const { data: assignments, forbidden } = await fetchResource(
    id => client.getAssignments(id), courseId,
    { userId, courseTitle, jobId, kind: 'assignments' },
  );
  if (forbidden || !assignments?.length) return;

  const relevant = assignments.filter(a => {
    const hasFiles = (a.attachments ?? []).length > 0 || (a.submission?.attachments ?? []).length > 0;
    return hasFiles || a.description?.trim();
  });
  if (relevant.length === 0) return;

  const assignmentsFolderId = await findOrCreateFolder(userId, 'Assignments', courseFolderId, {
    canvasCourseId: Number(courseId), canvasModuleId: ASSIGNMENTS_PARENT_MODULE_ID,
  });

  await pooled(relevant.map(assignment => async () => {
    if (await isJobCancelled(jobId)) return;

    const assignmentFolderId = await findOrCreateFolder(userId, assignment.name, assignmentsFolderId, {
      canvasCourseId: Number(courseId), canvasAssignmentId: assignment.id,
    });

    await importAssignmentInstructions(assignment, assignmentFolderId, { userId, courseId, jobId });

    // merge instructor + submission attachments, dedup by file ID
    const allAtts = [];
    const seen = new Set();
    for (const att of [...(assignment.attachments ?? []), ...(assignment.submission?.attachments ?? [])]) {
      if (!seen.has(att.id)) { seen.add(att.id); allAtts.push(att); }
    }

    if (allAtts.length > 0) {
      const fileCtx = {
        userId, courseId, parentFolderId: assignmentFolderId,
        client, storage, s3Prefix: `canvas/${userId}/${courseId}/assignments/${assignment.id}`, jobId,
      };
      await pooled(allAtts.map(att => () => downloadAndStoreFile(att, fileCtx)), FILE_CONCURRENCY);
    }
  }), FILE_CONCURRENCY);
}

async function processCourse(course, userId, ctx) {
  const { client, storage, jobId, jobType } = ctx;
  const courseId = String(course.id);

  // skip fully-restricted courses on sync
  if (jobType === 'sync') {
    const [restricted] = await sql`
      SELECT COUNT(DISTINCT CASE
        WHEN filename LIKE '% (modules)' THEN 'modules'
        WHEN filename LIKE '% (assignments)' THEN 'assignments'
      END) AS restricted_kinds
      FROM app.canvas_imports
      WHERE user_id = ${userId}::uuid
        AND canvas_course_id = ${courseId}::int
        AND status = 'forbidden'
        AND canvas_file_id = ${FORBIDDEN_SENTINEL_ID}
    `;
    if (restricted?.restricted_kinds >= 2) {
      console.log(`Skipping fully restricted course: ${course.name}`);
      return;
    }
  }

  const { title: courseTitle, academicYear } = cleanCourseName(course.course_code, course.name);
  console.log(`Processing course: ${courseTitle}`);

  const courseFolderId = await findOrCreateFolder(userId, courseTitle, null, {
    canvasCourseId: Number(courseId), canvasAcademicYear: academicYear,
  });

  const courseCtx = { client, storage, userId, courseTitle, jobId };
  await processModules(courseId, courseFolderId, courseCtx);
  await processAssignments(courseId, courseFolderId, courseCtx);
}

function parseJobCourses(job) {
  const raw = typeof job.course_ids === 'string' ? JSON.parse(job.course_ids) : job.course_ids;
  return raw.map(c =>
    typeof c === 'object' && c !== null
      ? { id: c.id, name: c.name ?? String(c.id), course_code: c.course_code ?? '' }
      : { id: c, name: String(c), course_code: '' }
  );
}

async function runJobPipeline(jobId, userId, courses, jobType) {
  await sql`UPDATE app.canvas_import_jobs SET status = 'processing', started_at = NOW() WHERE id = ${jobId}`;
  const [creds] = await sql`SELECT canvas_token, canvas_domain FROM app.login WHERE user_id = ${userId}`;
  if (!creds) throw new Error('User or Canvas credentials not found');

  const client = new CanvasClient(creds.canvas_domain, creds.canvas_token);
  const storage = getStorageProvider();

  // discovery phase: count expected files for accurate progress
  try {
    const expectedTotal = await discoverFileCount(courses, client);
    await sql`UPDATE app.canvas_import_jobs SET expected_total = ${expectedTotal} WHERE id = ${jobId}`;
    console.log(`Discovery complete: ${expectedTotal} files expected across ${courses.length} courses`);
  } catch (err) {
    console.warn(`Discovery phase failed (progress will use fallback): ${err.message}`);
  }

  await pooled(courses.map(course => () =>
    processCourse(course, userId, { client, storage, jobId, jobType })
  ), 3);

  if (jobType === 'sync') {
    await sql`UPDATE app.login SET canvas_last_sync_at = NOW() WHERE user_id = ${userId}`;
  }
}

// ── Job processing ────────────────────────────────────────────────────────────

export async function processImportJob(jobId) {
  console.log(`[${new Date().toISOString()}] Processing import job: ${jobId}`);
  try {
    const [job] = await sql`SELECT * FROM app.canvas_import_jobs WHERE id = ${jobId}`;
    if (!job) { console.error(`Job not found: ${jobId}`); return false; }

    if (job.status === 'cancelled') {
      console.log(`Job ${jobId} was cancelled, skipping`);
      return false;
    }

    await runJobPipeline(jobId, job.user_id, parseJobCourses(job), job.job_type ?? 'import');
    await sql`UPDATE app.canvas_import_jobs SET status = 'complete', completed_at = NOW() WHERE id = ${jobId}`;
    console.log(`Job completed: ${jobId}`);
    return true;
  } catch (error) {
    console.error(`Job failed: ${jobId}`, error);
    await sql`UPDATE app.canvas_import_jobs SET status = 'failed', error_message = ${error.message}, updated_at = NOW() WHERE id = ${jobId}`;
    return false;
  }
}
