/**
 * Canvas Import Worker — job orchestration.
 * Coordinates course-level import: modules, assignments, metadata sync.
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
import { CanvasClient } from "./client.js";
import { getStorageProvider } from "../storage/init.ts";
import {
  findOrCreateFolder,
  cleanCourseName,
  ASSIGNMENTS_PARENT_MODULE_ID,
} from "./canvas-folders.js";
import { syncAssignmentMetadata } from "./sync-assignments.js";
import { decrypt } from "../crypto.ts";
import { ensureMarkerRunning } from "../marker-ec2.ts";

import {
  pooled,
  parseEnvEnabled,
  PROCESSABLE_TYPES,
  resolveMimeType,
} from "./import-utils.js";
import {
  downloadAndStoreFile,
  fetchResource,
  processRagPipeline,
  FILE_CONCURRENCY,
} from "./import-file-processor.js";

const CANVAS_PREWARM_MARKER = parseEnvEnabled("CANVAS_PREWARM_MARKER", true);

// ── Course processing ────────────────────────────────────────────────────────

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

// ── Job pipeline ─────────────────────────────────────────────────────────────

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

// ── Exported job entry points ────────────────────────────────────────────────

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
  if (!buffer) {
    await sql`
      UPDATE app.canvas_imports
      SET status = 'error', error_message = ${`S3 object not found: ${s3Key}`}, updated_at = NOW()
      WHERE note_id = ${noteId}::uuid
    `;
    return;
  }

  try {
    await processRagPipeline(noteId, userId, parentFolderId, buffer, {
      filename,
      mimeType,
      s3Key,
      attempt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await sql`
      UPDATE app.canvas_imports
      SET status = 'error', error_message = ${message}, updated_at = NOW()
      WHERE note_id = ${noteId}::uuid
    `;
    console.error(
      `[${new Date().toISOString()}] Extraction retry failed for note ${noteId}: ${message}`,
    );
  }
}
