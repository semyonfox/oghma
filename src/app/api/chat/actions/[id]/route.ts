import { NextResponse } from "next/server";
import {
  requireAuth,
  withErrorHandler,
  ApiError,
  parseJsonObject,
  requireValidId,
} from "@/lib/api-error";
import sql from "@/database/pgsql";
import { createChatTools } from "@/lib/chat/build-stream";
import { canvasMcpStudentTools } from "@/lib/canvas/mcp";
import {
  CanvasClient,
  type FetchLike,
} from "@/lib/canvas-mcp/src/canvas/client";
import { executeTool } from "@/lib/canvas-mcp/src/tools/types";
import { loadCanvasCredentials } from "@/lib/canvas/credentials";
import { safeCanvasFetch } from "@/lib/canvas/safe-fetch";
import {
  canvasActionFingerprint,
  requiresToolConfirmation,
} from "@/lib/chat/actions";
import { checkRateLimit } from "@/lib/rateLimiter";

interface ActionRow {
  id: string;
  tool_name: string;
  input: unknown;
  status: string;
  session_id: string | null;
  target_origin: string | null;
  target_fingerprint: string | null;
}
type Context = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (_request, context: Context) => {
  const user = await requireAuth();
  const id = requireValidId((await context.params).id);
  const [action] = await sql<ActionRow[]>`
    SELECT id, tool_name, input, status, session_id, target_origin FROM app.chat_tool_actions
    WHERE id = ${id}::uuid AND user_id = ${user.user_id}::uuid
      AND session_version = ${user.session_version} AND expires_at > NOW()
  `;
  if (!action) throw new ApiError(404, "Action is missing or expired");
  return NextResponse.json(action, {
    headers: { "Cache-Control": "no-store" },
  });
});

export const POST = withErrorHandler(async (request, context: Context) => {
  const user = await requireAuth();
  const id = requireValidId((await context.params).id);
  const limited = await checkRateLimit("chat", user.user_id);
  if (limited) return limited;
  const body = await parseJsonObject(request, 1024);
  if (
    Object.keys(body).length !== 1 ||
    (body.decision !== "approve" && body.decision !== "reject")
  )
    throw new ApiError(400, "Choose approve or reject");
  // claiming is one-way: retries cannot repeat a write whose provider response was lost
  const [action] = await sql<ActionRow[]>`
    UPDATE app.chat_tool_actions a SET status = ${body.decision === "approve" ? "executing" : "rejected"}
    FROM app.login l
    WHERE a.id = ${id}::uuid AND a.user_id = ${user.user_id}::uuid AND a.status = 'pending'
      AND a.expires_at > NOW() AND a.session_version = ${user.session_version}
      AND l.user_id = a.user_id AND l.session_version = a.session_version
      AND l.is_active = true AND l.deleted_at IS NULL AND l.email_verified = true
    RETURNING a.id, a.tool_name, a.input, a.status, a.session_id, a.target_origin, a.target_fingerprint
  `;
  if (!action) throw new ApiError(409, "Action is already handled or expired");
  if (body.decision === "reject")
    return NextResponse.json({ status: "rejected" });
  try {
    if (!requiresToolConfirmation(action.tool_name))
      throw new Error("Invalid action type");
    if (action.tool_name.startsWith("canvas_")) {
      const definition = canvasMcpStudentTools.find(
        (tool) => tool.name === action.tool_name,
      );
      if (!definition) throw new Error("Canvas action is unavailable");
      const credentials = await loadCanvasCredentials(user.user_id);
      if (
        !credentials ||
        canvasActionFingerprint(credentials) !== action.target_fingerprint
      )
        throw new Error("Canvas connection changed. Request a new action.");
      const origin = new URL(`https://${credentials.domain}`).origin;
      const guardedFetch: FetchLike = (url, init) => {
        if (
          new URL(url).origin !== origin ||
          (init?.body != null && typeof init.body !== "string")
        )
          throw new Error("Unsafe Canvas request");
        return safeCanvasFetch(
          url,
          Object.fromEntries(new Headers(init?.headers).entries()),
          false,
          {
            method: init?.method,
            body: init?.body ?? undefined,
            signal: init?.signal ?? undefined,
          },
        );
      };
      const client = new CanvasClient({ ...credentials, fetch: guardedFetch });
      const result = await executeTool(
        definition,
        definition.inputSchema.parse(action.input),
        { canvas: client },
      );
      if (result.isError) throw new Error("Canvas action failed");
    } else {
      if (!action.session_id) throw new Error("Action session is missing");
      await createChatTools(
        user.user_id,
        action.session_id,
        null,
        {},
        false,
      ).executeApprovedAction(action.tool_name, action.input);
    }
    await sql`UPDATE app.chat_tool_actions SET status = 'completed' WHERE id = ${id}::uuid AND status = 'executing'`;
    return NextResponse.json({ status: "completed" });
  } catch {
    await sql`UPDATE app.chat_tool_actions SET status = 'failed' WHERE id = ${id}::uuid AND status = 'executing'`;
    throw new ApiError(
      502,
      "Action did not finish. Check the destination before requesting it again.",
    );
  }
});
