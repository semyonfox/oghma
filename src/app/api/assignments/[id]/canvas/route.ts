import { NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/database/pgsql";
import { ApiError, parseJson, requireAuth, requireValidId, withErrorHandler, type RouteParamsContext } from "@/lib/api-error";
import { loadCanvasCredentials } from "@/lib/canvas/credentials";
import { CanvasClient } from "@/lib/canvas/client";

const submissionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("online_text_entry"), content: z.string().trim().min(1).max(100_000) }),
  z.object({ type: z.literal("online_url"), content: z.url().max(4000).refine(value => /^https?:\/\//i.test(value)) }),
]);

async function loadAssignment(context: RouteParamsContext<{ id: string }>) {
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
  return { assignment: result.data, client, path, url: `https://${credentials.domain}${path}` };
}

export const GET = withErrorHandler(async (_request, context: RouteParamsContext<{ id: string }>) => {
  const { assignment, url } = await loadAssignment(context);
  return NextResponse.json({
    url,
    description: typeof assignment.description === "string" ? assignment.description : null,
    types: Array.isArray(assignment.submission_types) ? assignment.submission_types.filter(type => typeof type === "string") : [],
    locked: assignment.locked_for_user === true || assignment.published === false,
    submittedAt: typeof assignment.submission?.submitted_at === "string" ? assignment.submission.submitted_at : null,
  });
});

export const POST = withErrorHandler(async (request, context: RouteParamsContext<{ id: string }>) => {
  const parsed = submissionSchema.safeParse(await parseJson(request));
  if (!parsed.success) throw new ApiError(400, "Enter valid submission text or an HTTP website URL");
  const { assignment, client, path } = await loadAssignment(context);
  if (assignment.locked_for_user || assignment.published === false) throw new ApiError(409, "This assignment is locked in Canvas");
  if (!Array.isArray(assignment.submission_types) || !assignment.submission_types.includes(parsed.data.type)) {
    throw new ApiError(400, "This submission type is not accepted by the assignment");
  }
  const content = parsed.data.content;
  const submission = parsed.data.type === "online_url"
    ? { submission_type: parsed.data.type, url: content }
    : { submission_type: parsed.data.type, body: `<p>${content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>` };
  // Never retry a submission automatically: a lost response may still mean Canvas accepted it.
  let response: Response;
  try {
    response = await fetch(`${client.baseUrl}${path}/submissions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${client.token}`, Accept: "application/json+canvas-string-ids", "Content-Type": "application/json" },
      body: JSON.stringify({ submission }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new ApiError(502, "Submission could not be confirmed. Check Canvas before trying again.");
  }
  if (!response.ok) throw new ApiError(502, "Canvas did not confirm the submission. Check Canvas before trying again.");
  return NextResponse.json({ submitted: true });
});
