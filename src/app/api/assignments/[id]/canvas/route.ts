import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, parseJson, withErrorHandler, type RouteParamsContext } from "@/lib/api-error";
import { loadCanvasAssignment } from "@/lib/canvas/load-assignment";

const submissionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("online_text_entry"), content: z.string().trim().min(1).max(100_000) }),
  z.object({ type: z.literal("online_url"), content: z.url().max(4000).refine(value => /^https?:\/\//i.test(value)) }),
]);


export const GET = withErrorHandler(async (_request, context: RouteParamsContext<{ id: string }>) => {
  const { assignment, url } = await loadCanvasAssignment(context);
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
  const { assignment, client, path } = await loadCanvasAssignment(context);
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
