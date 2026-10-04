import { NextResponse } from "next/server";
import sql from "@/database/pgsql";
import { ApiError, withErrorHandler, type RouteParamsContext } from "@/lib/api-error";
import { loadCanvasAssignment } from "@/lib/canvas/load-assignment";
import { discoverAssignmentMaterials } from "@/lib/canvas/assignment-materials";
import { PROCESSABLE_TYPES, resolveMimeType } from "@/lib/canvas/file-types";
import { normalizeCanvasCourseSelection } from "@/lib/canvas/id";
import { startCanvasRun } from "@/lib/canvas/import-runs";
import { CanvasTrashConflictError } from "@/lib/canvas/trash-conflicts";
import { enqueueCanvasJob } from "@/lib/queue";
import logger from "@/lib/logger";

async function loadMaterials(context: RouteParamsContext<{ id: string }>) {
  const loaded = await loadCanvasAssignment(context);
  const { client, courseId, assignment, userId } = loaded;
  const files = await discoverAssignmentMaterials(client, courseId, assignment);
  const imports = files.length ? await sql<{ file_id: string; status: string; note_id: string | null; deleted: boolean }[]>`
    SELECT ci.canvas_file_id::text AS file_id, ci.status,
      CASE WHEN n.deleted_at IS NULL THEN n.note_id ELSE NULL END AS note_id,
      n.deleted_at IS NOT NULL AS deleted
    FROM app.canvas_imports ci
    LEFT JOIN app.notes n ON n.note_id = ci.note_id AND n.user_id = ci.user_id
    WHERE ci.user_id = ${userId}::uuid AND ci.canvas_file_id = ANY(${files.map(file => file.id)}::bigint[])
  ` : [];
  const byId = new Map(imports.map(row => [row.file_id, row]));
  const materials = files.map(({ id, file, unavailable }) => {
    const imported = byId.get(id);
    const mime = resolveMimeType(file?.display_name, file?.content_type);
    const supported = !!mime && PROCESSABLE_TYPES.has(mime);
    const status = imported?.deleted ? "trashed"
      : imported?.status === "complete" ? (imported.note_id ? "imported" : "unavailable")
      : unavailable ? "unavailable"
      : !supported ? "unsupported"
      : imported && !["error", "forbidden", "cancelled"].includes(imported.status) ? "importing"
      : "available";
    return {
      id, name: file?.display_name || `Canvas file ${id}`, status,
      noteId: status === "imported" ? imported?.note_id ?? null : null,
      url: `${new URL(client.baseUrl).origin}/courses/${courseId}/files/${id}`,
    };
  });
  return { ...loaded, materials };
}

export const GET = withErrorHandler(async (_request, context: RouteParamsContext<{ id: string }>) => {
  const { materials } = await loadMaterials(context);
  return NextResponse.json({ materials });
});

export const POST = withErrorHandler(async (_request, context: RouteParamsContext<{ id: string }>) => {
  const { client, userId, courseId, assignmentId, materials } = await loadMaterials(context);
  if (!materials.some(material => material.status === "available")) {
    return NextResponse.json({ queued: false });
  }
  const course = await client.getCourse(courseId);
  if (!course.data || course.error) throw new ApiError(502, "Could not load the Canvas course");
  const result = await startCanvasRun({
    userId,
    courses: [normalizeCanvasCourseSelection({ ...course.data, id: courseId, assignmentId })],
    mode: "import",
    checkTrash: true,
  }).catch((error: unknown) => {
    if (error instanceof CanvasTrashConflictError) {
      throw new ApiError(409, "Restore this course's folders from Trash before importing materials.");
    }
    throw error;
  });
  if (result.kind === "conflict") throw new ApiError(409, "Another Canvas import is running. Wait for it to finish, then try again.");
  if (result.kind === "created") {
    try {
      await enqueueCanvasJob("canvas-discover", { jobId: result.jobId, userId });
    } catch {
      // The worker's database poll also dispatches queued imports.
      logger.warn("Assignment import queued in database; queue dispatch unavailable", { jobId: result.jobId });
    }
  }
  return NextResponse.json({ queued: true, jobId: result.jobId });
});
