import sql from "@/database/pgsql";
import { ApiError, requireAuth, requireValidId, type RouteParamsContext } from "@/lib/api-error";
import { loadCanvasCredentials } from "./credentials";
import { CanvasClient } from "./client";

export async function loadCanvasAssignment(context: RouteParamsContext<{ id: string }>) {
  const user = await requireAuth();
  const { id } = await context.params;
  requireValidId(id);
  const [row] = await sql`
    SELECT canvas_course_id::text, canvas_assignment_id::text FROM app.assignments
    WHERE id = ${id}::uuid AND user_id = ${user.user_id}::uuid AND source = 'canvas'
  `;
  if (!row?.canvas_course_id || !row.canvas_assignment_id) throw new ApiError(404, "Canvas assignment not found");
  const credentials = await loadCanvasCredentials(user.user_id);
  if (!credentials) throw new ApiError(409, "Connect your Canvas account in Settings");
  const client = new CanvasClient(credentials.domain, credentials.token);
  const path = `/courses/${encodeURIComponent(row.canvas_course_id)}/assignments/${encodeURIComponent(row.canvas_assignment_id)}`;
  const result = await client.getAssignment(row.canvas_course_id, row.canvas_assignment_id);
  if (!result.data || result.error) throw new ApiError(result.forbidden ? 403 : 502, "Could not load this assignment from Canvas");
  return { userId: user.user_id, courseId: String(row.canvas_course_id), assignmentId: String(row.canvas_assignment_id), assignment: result.data, client, path, url: `https://${credentials.domain}${path}` };
}
