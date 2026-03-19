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

import sql from '@/database/pgsql.js';
import { v4 as uuidv4 } from 'uuid';
import { CanvasClient } from './client.js';
import { processExtractedText } from './text-processing.js';
import { chunkText } from '@/lib/chunking.ts';
import { embedChunks } from '@/lib/embeddings.ts';
import { getStorageProvider } from '@/lib/storage/init.ts';
import { addNoteToTree } from '@/lib/notes/storage/pg-tree.js';

const PROCESSABLE_TYPES = new Set(['application/pdf']);

// ── Utilities ─────────────────────────────────────────────────────────────────

function resolveMimeType(filename, canvasMimeType) {
  if (canvasMimeType && PROCESSABLE_TYPES.has(canvasMimeType)) return canvasMimeType;
  if (filename?.toLowerCase().endsWith('.pdf')) return 'application/pdf';
  return canvasMimeType;
}

/**
 * Creates a folder note and adds it to the tree under parentId (or root if null).
 * Returns the new folder's UUID.
 */
async function createFolder(userId, title, parentId) {
  const folderId = uuidv4();
  await sql`
    INSERT INTO app.notes (note_id, user_id, title, content, is_folder, deleted, created_at, updated_at)
    VALUES (${folderId}::uuid, ${userId}::uuid, ${title}, '', true, 0, NOW(), NOW())
  `;
  await addNoteToTree(userId, folderId, parentId ?? null);
  return folderId;
}

// ── RAG pipeline ──────────────────────────────────────────────────────────────

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
    console.error(`RAG pipeline error for note ${noteId}: ${error.message}`);
  }
}

// ── File processing ───────────────────────────────────────────────────────────

/**
 * Downloads a Canvas file, uploads to S3, creates a note, and runs the RAG pipeline.
 * Tracks progress in app.canvas_imports table.
 *
 * @param {object} file     - Canvas file metadata object (from getFile or assignment attachments)
 * @param {string} courseId
 * @param {string|null} moduleId - Canvas module ID (null for assignment files)
 * @param {string} userId
 * @param {string|null} parentFolderId - tree parent for the created note
 * @param {CanvasClient} client
 * @param {object} storage
 * @param {string} s3Prefix - e.g. `canvas/{userId}/{courseId}/{moduleId}`
 */
async function downloadAndStoreFile(file, courseId, moduleId, userId, parentFolderId, client, storage, s3Prefix) {
  const importRecordId = uuidv4();
  
  try {
    const resolvedMimeType = resolveMimeType(file.display_name, file.content_type);

    if (!PROCESSABLE_TYPES.has(resolvedMimeType)) {
      console.log(`Skipped (non-processable): ${file.display_name}`);
      return { skipped: true };
    }

    // skip files already successfully imported (dedup)
    const existing = await sql`
      SELECT 1 FROM app.canvas_imports
      WHERE user_id = ${userId}::uuid AND canvas_file_id = ${file.id}::int AND status = 'complete'
      LIMIT 1
    `;
    if (existing.length > 0) {
      console.log(`Already imported, skipping: ${file.display_name}`);
      return { skipped: true };
    }

    // Create initial import record (downloading state)
    await sql`
      INSERT INTO app.canvas_imports (id, user_id, canvas_course_id, canvas_module_id, canvas_file_id, filename, mime_type, status)
      VALUES (${importRecordId}::uuid, ${userId}::uuid, ${courseId}::int, ${moduleId ?? 0}::int, ${file.id}::int, ${file.display_name}, ${resolvedMimeType}, 'downloading')
    `;

    const { buffer, forbidden: dlForbidden } = await client.downloadFile(file.url);
    if (dlForbidden || !buffer) {
      console.log(`Download forbidden: ${file.display_name}`);
      await sql`
        UPDATE app.canvas_imports
        SET status = 'forbidden', error_message = 'File access denied by lecturer', updated_at = NOW()
        WHERE id = ${importRecordId}::uuid
      `;
      return;
    }

    const s3Key = `${s3Prefix}/${file.filename}`;
    await storage.putObject(s3Key, buffer, { contentType: resolvedMimeType });

    // Update to processing state
    await sql`
      UPDATE app.canvas_imports
      SET status = 'processing', updated_at = NOW()
      WHERE id = ${importRecordId}::uuid
    `;

    const noteId = uuidv4();
    await sql`
      INSERT INTO app.notes (note_id, user_id, title, content, s3_key, is_folder, deleted, created_at, updated_at)
      VALUES (${noteId}::uuid, ${userId}::uuid, ${file.display_name}, '', ${s3Key}, false, 0, NOW(), NOW())
    `;
    await addNoteToTree(userId, noteId, parentFolderId);

    await processRagPipeline(noteId, buffer);

    // Mark as complete
    await sql`
      UPDATE app.canvas_imports
      SET status = 'complete', note_id = ${noteId}::uuid, updated_at = NOW()
      WHERE id = ${importRecordId}::uuid
    `;
    console.log(`Processed: ${file.display_name}`);

  } catch (error) {
    console.error(`File processing error (${file.display_name}): ${error.message}`);
    try {
      await sql`
        UPDATE app.canvas_imports
        SET status = 'error', error_message = ${error.message}, updated_at = NOW()
        WHERE id = ${importRecordId}::uuid
      `;
    } catch (dbErr) {
      console.error(`Failed to update import record: ${dbErr.message}`);
    }
  }
}

// ── Course processing ─────────────────────────────────────────────────────────

/**
 * Imports all modules and assignments for a single course.
 *
 * @param {{ id: string|number, name: string, course_code: string }} course
 * @param {string} userId
 * @param {CanvasClient} client
 * @param {object} storage
 */
async function processCourse(course, userId, client, storage) {
  const courseId = String(course.id);
  // Build a readable title like "CT216 — Software Engineering"
  const courseTitle = [course.course_code, course.name].filter(Boolean).join(' — ') || courseId;

  console.log(`Processing course: ${courseTitle}`);

  // Top-level course folder
  let courseFolderId = null;
  try {
    courseFolderId = await createFolder(userId, courseTitle, null);
  } catch (err) {
    console.warn(`Failed to create course folder (${courseTitle}): ${err.message}`);
  }

  // ── Module folders ─────────────────────────────────────────────────────────
  const { data: modules } = await client.getModules(courseId);

  if (modules) {
    const moduleFolderMap = {};

    for (const module of modules) {
      const { data: items } = await client.getModuleItems(courseId, module.id);
      if (!items) continue;

      const fileItems = items.filter(item => item.type === 'File');
      if (fileItems.length === 0) continue;

      // Create module folder inside the course folder
      const moduleKey = `${courseId}:${module.id}`;
      if (!moduleFolderMap[moduleKey]) {
        try {
          moduleFolderMap[moduleKey] = await createFolder(userId, module.name, courseFolderId);
        } catch (err) {
          console.warn(`Failed to create module folder (${module.name}): ${err.message}`);
          moduleFolderMap[moduleKey] = courseFolderId;
        }
      }
      const moduleFolderId = moduleFolderMap[moduleKey];

      for (const item of fileItems) {
        const { data: file, forbidden: fileForbidden } = await client.getFile(courseId, item.content_id);
        if (fileForbidden || !file) {
          console.log(`File forbidden: ${item.title}`);
          continue;
        }
        await downloadAndStoreFile(
          file, courseId, module.id, userId, moduleFolderId, client, storage,
          `canvas/${userId}/${courseId}/${module.id}`
        );
      }
    }
  } else {
    console.warn(`No modules (or restricted) for course ${courseId}`);
  }

  // ── Assignments folder ─────────────────────────────────────────────────────
  const { data: assignments, forbidden: assignmentsForbidden } = await client.getAssignments(courseId);

  if (!assignmentsForbidden && assignments && assignments.length > 0) {
    // Only create the Assignments folder if at least one assignment has files
    const assignmentsWithFiles = assignments.filter(a =>
      (a.attachments ?? []).some(att => PROCESSABLE_TYPES.has(resolveMimeType(att.display_name, att.content_type)))
    );

    if (assignmentsWithFiles.length > 0) {
      let assignmentsFolderId = courseFolderId;
      try {
        assignmentsFolderId = await createFolder(userId, 'Assignments', courseFolderId);
      } catch (err) {
        console.warn(`Failed to create Assignments folder: ${err.message}`);
      }

      for (const assignment of assignmentsWithFiles) {
        const attachments = (assignment.attachments ?? []).filter(att =>
          PROCESSABLE_TYPES.has(resolveMimeType(att.display_name, att.content_type))
        );

        let assignmentFolderId = assignmentsFolderId;
        try {
          assignmentFolderId = await createFolder(userId, assignment.name, assignmentsFolderId);
        } catch (err) {
          console.warn(`Failed to create folder for assignment (${assignment.name}): ${err.message}`);
        }

        for (const attachment of attachments) {
          await downloadAndStoreFile(
            attachment, courseId, null, userId, assignmentFolderId, client, storage,
            `canvas/${userId}/${courseId}/assignments/${assignment.id}`
          );
        }
      }
    }
  }
}

// ── Job processing ────────────────────────────────────────────────────────────

export async function processImportJob(jobId) {
  console.log(`[${new Date().toISOString()}] Processing import job: ${jobId}`);

  try {
    const jobResult = await sql`SELECT * FROM app.canvas_import_jobs WHERE id = ${jobId}`;
    if (!jobResult || jobResult.length === 0) {
      console.error(`Job not found: ${jobId}`);
      return false;
    }

    const job = jobResult[0];
    const { user_id } = job;

    // course_ids may be an array of IDs (legacy) or an array of course objects (new)
    const rawCourses = typeof job.course_ids === 'string'
      ? JSON.parse(job.course_ids)
      : job.course_ids;

    // Normalise to objects with at least { id, name, course_code }
    const courses = rawCourses.map(c =>
      typeof c === 'object' && c !== null
        ? { id: c.id, name: c.name ?? String(c.id), course_code: c.course_code ?? '' }
        : { id: c, name: String(c), course_code: '' }
    );

    await sql`
      UPDATE app.canvas_import_jobs
      SET status = 'processing', started_at = NOW()
      WHERE id = ${jobId}
    `;

    const userResult = await sql`SELECT canvas_token, canvas_domain FROM app.login WHERE user_id = ${user_id}`;
    if (!userResult || !userResult[0]) throw new Error('User or Canvas credentials not found');

    const { canvas_token, canvas_domain } = userResult[0];
    const client = new CanvasClient(canvas_domain, canvas_token);
    const storage = getStorageProvider();

    for (const course of courses) {
      await processCourse(course, user_id, client, storage);
    }

    await sql`
      UPDATE app.canvas_import_jobs
      SET status = 'complete', completed_at = NOW()
      WHERE id = ${jobId}
    `;
    console.log(`Job completed: ${jobId}`);
    return true;

  } catch (error) {
    console.error(`Job failed: ${jobId}`, error);
    await sql`
      UPDATE app.canvas_import_jobs
      SET status = 'failed', error_message = ${error.message}, updated_at = NOW()
      WHERE id = ${jobId}
    `;
    return false;
  }
}

// ── Worker loop ───────────────────────────────────────────────────────────────

async function runWorker() {
  console.log('Canvas Import Worker started');

  while (true) {
    try {
      const jobs = await sql`
        SELECT id FROM app.canvas_import_jobs
        WHERE status = 'queued'
        ORDER BY created_at ASC
        LIMIT 1
      `;

      if (jobs && jobs.length > 0) {
        await processImportJob(jobs[0].id);
      } else {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (error) {
      console.error('Worker error:', error);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runWorker().catch(console.error);
}
