/**
 * Canvas Import — Discovery Phase
 *
 * Fetches courses, modules, pages, files from Canvas API and inserts
 * pending import records. Also handles SQS fan-out of per-file messages
 * and the legacy single-pass course processing path.
 */

import sql from "../../database/pgsql.js";
import { dispatchFairCanvasFiles } from "./import-scheduler.ts";
import { CanvasClient } from "./client.js";
import { pooled } from "./async-limiter.js";
import {
  findOrCreateFolder,
  cleanCourseName,
  ASSIGNMENTS_PARENT_MODULE_ID,
} from "./canvas-folders.js";
import { syncAssignmentMetadata } from "./sync-assignments.js";
import { decrypt } from "../crypto.ts";
import logger from "../logger.ts";
import {
  canvasIdForBigintColumn,
  canvasModuleIdForBigintColumn,
  normalizeCanvasCourseSelection,
} from "./id.js";

import {
  PROCESSABLE_TYPES,
  FILE_CONCURRENCY,
  resolveMimeType,
  fetchResource,
  isJobCancelled,
  downloadAndStoreFile,
} from "./import-extraction.js";

// Canvas penalizes concurrent requests. Discovery deliberately defaults to a
// single in-flight request per import; an operator can raise it only after
// measuring their institution's throttle behaviour.
const CANVAS_DISCOVERY_CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.CANVAS_DISCOVERY_CONCURRENCY ?? "", 10) || 1,
);

function throwFirstRejected(results, context) {
  const failure = results.find((result) => result.status === "rejected");
  if (failure) {
    throw new Error(
      `Canvas ${context} failed: ${
        failure.reason instanceof Error ? failure.reason.message : String(failure.reason)
      }`,
    );
  }
}

// ── Job course parsing ──────────────────────────────────────────────────────

export function parseJobCourses(job) {
  const raw =
    typeof job.course_ids === "string"
      ? JSON.parse(job.course_ids)
      : job.course_ids;
  if (!Array.isArray(raw)) {
    throw new Error("Canvas import job course_ids must be an array");
  }
  return raw.map(normalizeCanvasCourseSelection);
}

// ── Pending file insertion ──────────────────────────────────────────────────

// Upsert a processable file into canvas_imports as 'pending'. A file can be
// listed in the flat Files inventory as well as a module/assignment; preserve
// the most specific placement rather than letting a later flat listing move it
// back to the course root.
async function insertPendingFile(
  userId,
  file,
  jobId,
  courseId,
  moduleId,
  parentFolderId,
  s3Prefix,
) {
  const moduleIdVal = moduleId ?? -1;
  const canvasCourseId = canvasIdForBigintColumn(courseId, "Canvas course ID");
  const canvasModuleId = canvasModuleIdForBigintColumn(moduleIdVal);
  const canvasFileId = canvasIdForBigintColumn(file.id, "Canvas file ID");
  const resolvedMimeType = resolveMimeType(
    file.display_name,
    file.content_type,
  );
  if (!PROCESSABLE_TYPES.has(resolvedMimeType)) return;
  const restricted = Boolean(file.locked_for_user || file.hidden_for_user);
  const status = restricted ? "forbidden" : "pending";
  const errorMessage = restricted
    ? file.lock_explanation || "File is locked or hidden for this Canvas user"
    : null;

  // The discovery job is the generation fence for this row. Once a job is
  // cancelled or has moved to processing, a late Canvas page must not create
  // or revive work for it.
  await sql`
    INSERT INTO app.canvas_imports (
      id, user_id, canvas_course_id, canvas_module_id, canvas_file_id,
      filename, mime_type, status, error_message, job_id, parent_folder_id, s3_prefix
    )
    SELECT
      gen_random_uuid(), ${userId}::uuid, ${canvasCourseId}::bigint, ${canvasModuleId}::bigint,
      ${canvasFileId}::bigint, ${file.display_name}, ${resolvedMimeType},
      ${status}, ${errorMessage}, ${jobId}::uuid, ${parentFolderId}::uuid, ${s3Prefix}
    WHERE EXISTS (
      SELECT 1
      FROM app.canvas_import_jobs
      WHERE id = ${jobId}::uuid
        AND user_id = ${userId}::uuid
        AND type = 'canvas'
        AND status = 'discovering'
    )
    ON CONFLICT (user_id, canvas_file_id)
    DO UPDATE SET
      status           = EXCLUDED.status,
      job_id           = EXCLUDED.job_id,
      canvas_course_id = EXCLUDED.canvas_course_id,
      canvas_module_id = CASE
        WHEN (CASE WHEN EXCLUDED.canvas_module_id <> -1 THEN 2
                   WHEN EXCLUDED.s3_prefix LIKE '%/assignments/%' THEN 1
                   ELSE 0 END) >
             (CASE WHEN app.canvas_imports.canvas_module_id <> -1 THEN 2
                   WHEN app.canvas_imports.s3_prefix LIKE '%/assignments/%' THEN 1
                   ELSE 0 END)
          THEN EXCLUDED.canvas_module_id
        ELSE app.canvas_imports.canvas_module_id
      END,
      filename         = EXCLUDED.filename,
      mime_type        = EXCLUDED.mime_type,
      parent_folder_id = CASE
        WHEN (CASE WHEN EXCLUDED.canvas_module_id <> -1 THEN 2
                   WHEN EXCLUDED.s3_prefix LIKE '%/assignments/%' THEN 1
                   ELSE 0 END) >
             (CASE WHEN app.canvas_imports.canvas_module_id <> -1 THEN 2
                   WHEN app.canvas_imports.s3_prefix LIKE '%/assignments/%' THEN 1
                   ELSE 0 END)
          THEN EXCLUDED.parent_folder_id
        ELSE app.canvas_imports.parent_folder_id
      END,
      s3_prefix = CASE
        WHEN (CASE WHEN EXCLUDED.canvas_module_id <> -1 THEN 2
                   WHEN EXCLUDED.s3_prefix LIKE '%/assignments/%' THEN 1
                   ELSE 0 END) >
             (CASE WHEN app.canvas_imports.canvas_module_id <> -1 THEN 2
                   WHEN app.canvas_imports.s3_prefix LIKE '%/assignments/%' THEN 1
                   ELSE 0 END)
          THEN EXCLUDED.s3_prefix
        ELSE app.canvas_imports.s3_prefix
      END,
      error_message    = EXCLUDED.error_message,
      dispatched_at    = CASE
        WHEN EXCLUDED.status = 'pending' THEN NULL
        ELSE app.canvas_imports.dispatched_at
      END,
      updated_at       = NOW()
    -- Only a terminal record may begin a new import generation. In-flight
    -- rows belong to the existing job and must never be reassigned by a
    -- duplicate discovery or stale page response.
    WHERE app.canvas_imports.status IN ('error', 'forbidden', 'cancelled')
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

  const moduleResults = await pooled(
    modules.map((module) => async () => {
      const { data: items, forbidden } = await fetchResource(
        () => client.getModuleItems(courseId, module.id),
        courseId,
        userId,
        courseTitle,
        `module ${module.id} files`,
        jobId,
      );
      if (forbidden) return;
      if (!items) {
        throw new Error(
          `module ${module.id} items unavailable: empty response`,
        );
      }

      const fileItems = items.filter((item) => item.type === "File");
      if (fileItems.length === 0) return;

      // create folder now so parent_folder_id is stable before per-file processing
      const folderId = await findOrCreateFolder(
        userId,
        module.name,
        courseFolderId,
        {
          canvasCourseId: canvasIdForBigintColumn(courseId, "Canvas course ID"),
          canvasModuleId: canvasIdForBigintColumn(module.id, "Canvas module ID"),
        },
      );
      const s3Prefix = `canvas/${userId}/${courseId}/${module.id}`;

      const fileResults = await pooled(
        fileItems.map((item) => async () => {
          const { data: file, forbidden: fileForbidden } = await fetchResource(
            () => client.getFile(courseId, item.content_id),
            courseId,
            userId,
            courseTitle,
            `module file ${item.content_id}`,
            jobId,
          );
          if (fileForbidden) return;
          if (!file) {
            throw new Error(
              `file ${item.content_id} metadata unavailable: empty response`,
            );
          }
          await insertPendingFile(
            userId,
            file,
            jobId,
            canvasIdForBigintColumn(courseId, "Canvas course ID"),
            module.id,
            folderId,
            s3Prefix,
          );
        }),
        CANVAS_DISCOVERY_CONCURRENCY,
      );
      throwFirstRejected(fileResults, `module ${module.id} file metadata`);
    }),
    CANVAS_DISCOVERY_CONCURRENCY,
  );
  throwFirstRejected(moduleResults, `module discovery for ${courseId}`);
}

/**
 * Walks a course's assignments that carry processable attachments, creating the
 * Assignments/<assignment> folders. Both import pipelines share this walk and
 * differ only in `handleAttachments`: two-phase discovery queues a pending row,
 * the legacy single pass downloads immediately.
 */
async function eachAssignmentWithFiles(
  courseId,
  userId,
  courseTitle,
  courseFolderId,
  ctx,
  handleAttachments,
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

  const hasProcessableFile = (att) =>
    PROCESSABLE_TYPES.has(resolveMimeType(att.display_name, att.content_type));
  const assignmentsWithFiles = assignments.filter((a) =>
    (a.attachments ?? []).some(hasProcessableFile),
  );
  if (assignmentsWithFiles.length === 0) return;

  const assignmentsFolderId = await findOrCreateFolder(
    userId,
    "Assignments",
    courseFolderId,
    {
      canvasCourseId: canvasIdForBigintColumn(courseId, "Canvas course ID"),
      canvasModuleId: ASSIGNMENTS_PARENT_MODULE_ID,
    },
  );

  const assignmentResults = await pooled(
    assignmentsWithFiles.map((assignment) => async () => {
      const attachments = (assignment.attachments ?? []).filter(
        hasProcessableFile,
      );
      const assignmentFolderId = await findOrCreateFolder(
        userId,
        assignment.name,
        assignmentsFolderId,
        {
          canvasCourseId: canvasIdForBigintColumn(courseId, "Canvas course ID"),
          canvasAssignmentId: canvasIdForBigintColumn(
            assignment.id,
            "Canvas assignment ID",
          ),
        },
      );
      await handleAttachments(assignment, attachments, assignmentFolderId);
    }),
    CANVAS_DISCOVERY_CONCURRENCY,
  );
  throwFirstRejected(assignmentResults, `assignment discovery for ${courseId}`);
}

async function discoverAssignmentFiles(
  courseId,
  userId,
  courseTitle,
  courseFolderId,
  ctx,
) {
  const { jobId } = ctx;
  await eachAssignmentWithFiles(
    courseId,
    userId,
    courseTitle,
    courseFolderId,
    ctx,
    async (assignment, attachments, assignmentFolderId) => {
      const s3Prefix = `canvas/${userId}/${courseId}/assignments/${assignment.id}`;
      for (const att of attachments) {
        await insertPendingFile(
          userId,
          att,
          jobId,
          canvasIdForBigintColumn(courseId, "Canvas course ID"),
          null,
          assignmentFolderId,
          s3Prefix,
        );
      }
    },
  );
}

// Canvas files can exist outside modules and assignment attachments. The
// course Files endpoint is the authoritative flat inventory; the unique
// (user_id, canvas_file_id) constraint collapses entries also discovered via
// another placement without duplicating the document.
async function discoverStandaloneCourseFiles(
  courseId,
  userId,
  courseTitle,
  courseFolderId,
  ctx,
) {
  const { client, jobId } = ctx;
  const { data: files, forbidden } = await fetchResource(
    (id) => client.getCourseFiles(id),
    courseId,
    userId,
    courseTitle,
    "files",
    jobId,
  );
  if (forbidden || !files?.length) return;

  const results = await pooled(
    files.map((file) => async () => {
      await insertPendingFile(
        userId,
        file,
        jobId,
        canvasIdForBigintColumn(courseId, "Canvas course ID"),
        null,
        courseFolderId,
        `canvas/${userId}/${courseId}/files`,
      );
    }),
    CANVAS_DISCOVERY_CONCURRENCY,
  );
  throwFirstRejected(results, `course file discovery for ${courseId}`);
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
    canvasCourseId: canvasIdForBigintColumn(course.id, "Canvas course ID"),
    canvasAcademicYear: academicYear,
  });

  // Canvas dynamically charges request cost and penalizes parallel calls.
  // Keep top-level resource discovery serial; its inner operations are also
  // bounded by CANVAS_DISCOVERY_CONCURRENCY.
  await discoverModuleFiles(courseId, userId, courseTitle, courseFolderId, ctx);
  await discoverAssignmentFiles(
    courseId,
    userId,
    courseTitle,
    courseFolderId,
    ctx,
  );
  await discoverStandaloneCourseFiles(
    courseId,
    userId,
    courseTitle,
    courseFolderId,
    ctx,
  );

  await syncAssignmentMetadataQuietly(courseId, userId, courseTitle, ctx.client);
}

// metadata sync is best-effort: a course still imports if the tracker sync fails
async function syncAssignmentMetadataQuietly(
  courseId,
  userId,
  courseTitle,
  client,
) {
  try {
    const { synced, errors } = await syncAssignmentMetadata(
      courseId,
      userId,
      courseTitle,
      client,
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
          canvasCourseId: canvasIdForBigintColumn(courseId, "Canvas course ID"),
          canvasModuleId: canvasIdForBigintColumn(module.id, "Canvas module ID"),
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
  await eachAssignmentWithFiles(
    courseId,
    userId,
    courseTitle,
    courseFolderId,
    ctx,
    async (assignment, attachments, assignmentFolderId) => {
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
    },
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
    canvasCourseId: canvasIdForBigintColumn(course.id, "Canvas course ID"),
    canvasAcademicYear: academicYear,
  });
  await processModules(courseId, userId, courseTitle, courseFolderId, ctx);
  await processAssignments(courseId, userId, courseTitle, courseFolderId, ctx);

  // sync assignment metadata (titles, due dates, scores) for the tracker
  await syncAssignmentMetadataQuietly(courseId, userId, courseTitle, ctx.client);
}

// ── Two-phase discovery entry point ─────────────────────────────────────────

function canvasQueueAttemptLimit() {
  const configured = Number.parseInt(
    process.env.CANVAS_FILE_QUEUE_MAX_ATTEMPTS ?? "",
    10,
  );
  return Number.isFinite(configured) && configured > 0 ? configured : 3;
}

export async function processDiscoverJob(jobId, attempt = 0) {
  console.log(
    `[${new Date().toISOString()}] Starting discovery for job: ${jobId}`,
  );
  try {
    // Claim discovery atomically. Queue providers are at-least-once, so a
    // duplicate delivery must not run a second course walk alongside a live
    // worker. A stale discovery is explicitly reclaimed by the DB poller.
    const [job] = await sql`
      UPDATE app.canvas_import_jobs
      SET status = 'discovering',
          started_at = COALESCE(started_at, NOW()),
          updated_at = NOW()
      WHERE id = ${jobId}
        AND type = 'canvas'
        AND (
          status = 'queued'
          OR (
            status = 'discovering'
            AND updated_at < NOW() - INTERVAL '15 minutes'
          )
        )
      RETURNING *
    `;
    if (!job) {
      console.log(`Job ${jobId} is already claimed, terminal, or missing`);
      return false;
    }

    const [creds] =
      await sql`SELECT canvas_token, canvas_domain FROM app.login WHERE user_id = ${job.user_id}`;
    if (!creds) throw new Error("Canvas credentials not found");
    const plainToken = decrypt(creds.canvas_token, job.user_id);
    const client = new CanvasClient(creds.canvas_domain, plainToken);

    const courseResults = await pooled(
      parseJobCourses(job).map((course) => async () => {
        if (await isJobCancelled(jobId)) return;
        await discoverCourse(course, job.user_id, { client, jobId });
        // Heartbeat after each bounded course walk. The orphan detector can
        // distinguish a slow but healthy import from a dead worker.
        await sql`
          UPDATE app.canvas_import_jobs
          SET updated_at = NOW()
          WHERE id = ${jobId} AND status = 'discovering'
        `;
      }),
      CANVAS_DISCOVERY_CONCURRENCY,
    );
    throwFirstRejected(courseResults, "course discovery");

    if (await isJobCancelled(jobId)) {
      // Cancellation can arrive while the final Canvas request is in flight.
      // Mark any rows discovered after the cancellation transaction so they
      // cannot be scheduled later.
      await sql`
        UPDATE app.canvas_imports
        SET status = 'cancelled', error_message = 'Cancelled by user', updated_at = NOW()
        WHERE job_id = ${jobId}::uuid
          AND status IN ('pending', 'downloading', 'processing', 'indexing', 'pending_retry', 'pending_marker')
      `;
      console.log(`Job ${jobId} cancelled during discovery`);
      return false;
    }

    // count every canvas_imports row for this job (pending + forbidden from course restrictions)
    const [{ count }] =
      await sql`SELECT COUNT(*) as count FROM app.canvas_imports WHERE job_id = ${jobId}::uuid`;
    const total = parseInt(count, 10);

    const transitioned = await sql`
      UPDATE app.canvas_import_jobs
      SET status = 'processing', expected_total = ${total}, updated_at = NOW()
      WHERE id = ${jobId} AND status = 'discovering'
      RETURNING id
    `;
    if (transitioned.length === 0) {
      console.log(`Job ${jobId} was cancelled during discovery finalization`);
      return false;
    }

    const pendingRecords =
      await sql`SELECT id FROM app.canvas_imports WHERE job_id = ${jobId}::uuid AND status = 'pending'`;

    if (pendingRecords.length === 0) {
      await sql`
        UPDATE app.canvas_import_jobs
        SET status = 'complete', completed_at = NOW(), updated_at = NOW()
        WHERE id = ${jobId} AND status = 'processing'
      `;

      console.log(
        `Job ${jobId}: no processable files found, completed immediately`,
      );
      return true;
    }

    await dispatchFairCanvasFiles();

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
      `[${new Date().toISOString()}] Discovery done: ${total} total, ${pendingRecords.length} ready for fair scheduling for job ${jobId}`,
    );
    return true;
  } catch (error) {
    console.error(`Discovery failed: ${jobId}`, error);
    const message = error instanceof Error ? error.message : String(error);
    logger.error("canvas-import-discovery-error", {
      jobId,
      error: message,
    });
    await sql`
      UPDATE app.canvas_import_jobs
      SET status = ${attempt + 1 < canvasQueueAttemptLimit() ? "queued" : "failed"},
          error_message = ${message},
          updated_at = NOW()
      WHERE id = ${jobId}
        AND type = 'canvas'
        AND status = 'discovering'
    `;
    if (attempt + 1 < canvasQueueAttemptLimit()) throw error;
    return false;
  }
}
