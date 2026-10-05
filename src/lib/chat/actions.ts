import { createHash } from "node:crypto";
import {
  loadCanvasCredentials,
  type CanvasCredentials,
} from "@/lib/canvas/credentials";
import sql from "@/database/pgsql";
import type { ToolSet } from "ai";
import { isReadOnlyCanvasTool } from "@/lib/canvas/tool-policy";

const READ_ONLY_LOCAL_TOOLS = new Set([
  "getAppGuide",
  "getChunks",
  "readNote",
  "findFolder",
  "getTimeBlocks",
]);

export function requiresToolConfirmation(name: string): boolean {
  return name.startsWith("canvas_")
    ? !isReadOnlyCanvasTool(name)
    : !READ_ONLY_LOCAL_TOOLS.has(name);
}

export function canvasActionFingerprint(
  credentials: CanvasCredentials,
): string {
  return createHash("sha256")
    .update(credentials.domain)
    .update("\0")
    .update(credentials.token)
    .digest("hex");
}

export async function proposeToolAction(
  userId: string,
  sessionId: string | null,
  name: string,
  input: unknown,
) {
  const payload = JSON.stringify(input);
  if (!payload || Buffer.byteLength(payload) > 256 * 1024)
    throw new Error("Action input is too large");
  const canvas = name.startsWith("canvas_")
    ? await loadCanvasCredentials(userId)
    : null;
  if (name.startsWith("canvas_") && !canvas)
    throw new Error("Canvas is not connected");
  const targetOrigin = canvas
    ? new URL(`https://${canvas.domain}`).origin
    : null;
  const targetFingerprint = canvas ? canvasActionFingerprint(canvas) : null;
  const action = await sql.begin(async (tx) => {
    const [account] = await tx<{ session_version: number }[]>`
      SELECT session_version FROM app.login WHERE user_id = ${userId}::uuid
        AND is_active = true AND deleted_at IS NULL AND email_verified = true FOR UPDATE
    `;
    if (!account) throw new Error("Account is unavailable");
    await tx`DELETE FROM app.chat_tool_actions WHERE user_id = ${userId}::uuid AND expires_at <= NOW()`;
    const [count] = await tx<{ total: number }[]>`
      SELECT COUNT(*)::int AS total FROM app.chat_tool_actions WHERE user_id = ${userId}::uuid
    `;
    if (count.total >= 30)
      throw new Error(
        "Too many pending actions. Review them before requesting more.",
      );
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO app.chat_tool_actions (user_id, session_id, session_version, tool_name, input, target_origin, target_fingerprint, expires_at)
      VALUES (${userId}::uuid, ${sessionId}::uuid, ${account.session_version}, ${name}, ${payload}::text::jsonb, ${targetOrigin}, ${targetFingerprint}, NOW() + INTERVAL '15 minutes')
      RETURNING id
    `;
    return row;
  });
  return {
    requiresConfirmation: true,
    actionId: action.id,
    reviewUrl: `/chat/actions/${action.id}`,
    message:
      "The action has not run. The user must review the stored details and approve it using the confirmation button.",
  };
}

export function confirmChatTools(
  tools: ToolSet,
  userId: string,
  sessionId: string,
): ToolSet {
  return Object.fromEntries(
    Object.entries(tools).map(([name, definition]) => [
      name,
      requiresToolConfirmation(name)
        ? {
            ...definition,
            execute: async (input: unknown) =>
              proposeToolAction(userId, sessionId, name, input),
          }
        : definition,
    ]),
  );
}
