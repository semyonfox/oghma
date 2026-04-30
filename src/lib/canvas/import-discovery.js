/**
 * Canvas Import — Discovery Phase
 *
 * Fetches courses, modules, pages, files from Canvas API and inserts
 * pending import records. Also handles SQS fan-out of per-file messages
 * and the legacy single-pass course processing path.
 */

import sql from "../../database/pgsql.js";
import { SQSClient, SendMessageBatchCommand } from "@aws-sdk/client-sqs";
import { CanvasClient } from "./client.js";
import { pooled } from "./async-limiter.js";
import {
  findOrCreateFolder,
  cleanCourseName,
  ASSIGNMENTS_PARENT_MODULE_ID,
} from "./canvas-folders.js";
import { syncAssignmentMetadata } from "./sync-assignments.js";
import { decrypt } from "../crypto.ts";
import { ensureWorkerRunning } from "../ecs.ts";
import { ensureMarkerRunning } from "../marker-ec2.ts";
import logger from "../logger.ts";
import { parseEnvEnabled } from "./import-metrics.js";
import {
  PROCESSABLE_TYPES,
  FILE_CONCURRENCY,
  resolveMimeType,
  fetchResource,
  isJobCancelled,
  downloadAndStoreFile,
} from "./import-extraction.js";

const CANVAS_PREWARM_MARKER = parseEnvEnabled("CANVAS_PREWARM_MARKER", true);

const _workerSqsClient = new SQSClient({
  region: process.env.AWS_REGION ?? "eu-west-1",
});

// ── Job course parsing ──────────────────────────────────────────────────────

export function parseJobCourses(job) {
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

// ── SQS fan-out ─────────────────────────────────────────────────────────────

// batch-send per-file SQS messages (up to 10 per SendMessageBatch call)
async function sendFileMessages(records, jobId, userId) {
  const queueUrl = process.env.SQS_QUEUE_URL;
  if (!queueUrl) {
    console.warn(
      `[sendFileMessages] SQS_QUEUE_URL not set — ${records.length} file messages skipped`,
    );
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

// ── Pending file insertion ──────────────────────────────────────────────────

// upsert a processable file into canvas_imports as 'pending'.
// skips non-processable mime types and files already in a terminal state.
async function insertPendingFile(
  userId,
  file,
  jobId,
  courseId,
  moduleId,
  parentFolderId,
  s3Prefix,
) {
  const resolvedMimeType = resolveMimeType(
    file.display_name,
    file.content_type,
  );
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
    WHERE app.canvas_imports.status NOT IN ('complete', 'indexing', 'pending_retry', 'pending_marker')
  `;
}

// ── Two-phase discovery helpers ─────────────────────────────────────────────

async function discoverModuleFiles(
  courseId,
  userId,
  courseTitle,
  courseFolderId,
  ctx,
) {
  const { client, jobId } = ctx;
  const { data: modules } = await fetchResource(
    (id) => client.getModules(id),
    courseId,
    userId,
    courseTitle,
    "modules",
    jobId,
  );
  if (!modules) return;

  await pooled(
    modules.map((module) => async () => {
      const { data: items } = await client.getModuleItems(courseId, module.id);
      if (!items) return;

      const fileItems = items.filter((item) => item.type === "File");
      if (fileItems.length === 0) return;

      // create folder now so parent_folder_id is stable before per-file processing
      const folderId = await findOrCreateFolder(
        userId,
        module.name,
        courseFolderId,
        {
          canvasCourseId: Number(courseId),
          canvasModuleId: module.id,
        },
      );
      const s3Prefix = `canvas/${userId}/${courseId}/${module.id}`;

      await pooled(
        fileItems.map((item) => async () => {
          const { data: file, forbidden: fileForbidden } = await client.getFile(
            courseId,
            item.content_id,
          );
          if (fileForbidden || !file) return;
          await insertPendingFile(
            userId,
            file,
            jobId,
            Number(courseId),
            module.id,
            folderId,
            s3Prefix,
          );
        }),
        FILE_CONCURRENCY,
      );
    }),
    FILE_CONCURRENCY,
  );
}

async function discoverAssignmentFiles(
  courseId,
  userId,
  courseTitle,
  courseFolderId,
  ctx,
) {
  const { client, jobId } = ctx;
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
      const s3Prefix = `canvas/${userId}/${courseId}/assignments/${assignment.id}`;
      for (const att of attachments) {
        await insertPendingFile(
          userId,
          att,
          jobId,
          Number(courseId),
          null,
          assignmentFolderId,
          s3Prefix,
        );
      }
    }),
    FILE_CONCURRENCY,
  );
}

async function discoverCourse(course, userId, ctx) {
  const courseId = String(course.id);
  const { title: courseTitle, academicYear } = cleanCourseName(
    course.course_code,
    course.name,
    course.term,
  );
  console.log(`Discovering course: ${courseTitle}`);

  const courseFolderId = await findOrCreateFolder(userId, courseTitle, null, {
    canvasCourseId: course.id,
    canvasAcademicYear: academicYear,
  });

  await Promise.all([
    discoverModuleFiles(courseId, userId, courseTitle, courseFolderId, ctx),
    discoverAssignmentFiles(courseId, userId, courseTitle, courseFolderId, ctx),
  ]);

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

// ── Legacy single-pass course processing ────────────────────────────────────

async function processModules(
  courseId,
  userId,
  courseTitle,
  courseFolderId,
  ctx,
) {
  const { client, jobId } = ctx;
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
        storage: ctx.storage,
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
  const { client, jobId } = ctx;
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
        storage: ctx.storage,
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

export async function processCourse(course, userId, ctx) {
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

// ── Two-phase discovery entry point ─────────────────────────────────────────

export async function processDiscoverJob(jobId) {
  console.log(
    `[${new Date().toISOString()}] Starting discovery for job: ${jobId}`,
  );
  try {
    const [job] =
      await sql`SELECT * FROM app.canvas_import_jobs WHERE id = ${jobId}`;
    if (!job) {
      console.error(`Job not found: ${jobId}`);
      return false;
    }
    if (job.status === "cancelled") {
      console.log(`Job ${jobId} cancelled`);
      return false;
    }
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

    const [creds] =
      await sql`SELECT canvas_token, canvas_domain FROM app.login WHERE user_id = ${job.user_id}`;
    if (!creds) throw new Error("Canvas credentials not found");
    const plainToken = decrypt(creds.canvas_token, job.user_id);
    const client = new CanvasClient(creds.canvas_domain, plainToken);

    await pooled(
      parseJobCourses(job).map(
        (course) => () =>
          discoverCourse(course, job.user_id, { client, jobId }),
      ),
      3,
    );

    if (await isJobCancelled(jobId)) {
      console.log(`Job ${jobId} cancelled during discovery`);
      return false;
    }

    // count every canvas_imports row for this job (pending + forbidden from course restrictions)
    const [{ count }] =
      await sql`SELECT COUNT(*) as count FROM app.canvas_imports WHERE job_id = ${jobId}::uuid`;
    const total = parseInt(count, 10);

    await sql`UPDATE app.canvas_import_jobs SET status = 'processing', expected_total = ${total} WHERE id = ${jobId}`;

    if (total === 0) {
      await sql`UPDATE app.canvas_import_jobs SET status = 'complete', completed_at = NOW() WHERE id = ${jobId}`;
      console.log(
        `Job ${jobId}: no processable files found, completed immediately`,
      );
      return true;
    }

    const pendingRecords =
      await sql`SELECT id FROM app.canvas_imports WHERE job_id = ${jobId}::uuid AND status = 'pending'`;
    await sendFileMessages(pendingRecords, jobId, job.user_id);

    // scale workers based on how many files need processing
    Promise.resolve()
      .then(() => ensureWorkerRunning(pendingRecords.length))
      .catch((err) => console.warn(`Worker scale-up skipped: ${err.message}`));

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
