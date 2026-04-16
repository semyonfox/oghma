import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import type { ToolSet } from "ai";
import { canvasMcpToolSchemas } from "@/lib/canvas/mcp";
import { createInternalMcpToken } from "@/lib/mcp/internal-auth";
import logger from "@/lib/logger";

function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function resolveAppOrigin(input: {
  requestOrigin?: string | null;
  referer?: string | null;
}): string | null {
  return (
    normalizeOrigin(input.requestOrigin) ||
    normalizeOrigin(input.referer) ||
    normalizeOrigin(process.env.APP_BASE_URL) ||
    normalizeOrigin(process.env.NEXTAUTH_URL)
  );
}

export const canvasToolInstruction =
  "Canvas tools available when course data is needed:\n" +
  "- canvas_list_courses({ limit? }) — list active Canvas courses to find course IDs.\n" +
  "- canvas_list_modules({ courseId, limit? }) — list modules in a Canvas course.\n" +
  "- canvas_list_assignments({ courseId, limit? }) — list assignments with due dates and submission state.\n" +
  "- canvas_list_module_items({ courseId, moduleId, limit? }) — inspect items inside a module.\n" +
  "- canvas_get_file({ courseId, fileId }) — fetch Canvas file metadata only.\n" +
  "Use Canvas tools only when the user asks about Canvas course content, assignments, modules, or files. Prefer note tools first when the answer likely exists in imported notes.";

export async function createCanvasMcpTools(args: {
  userId: string;
  appOrigin: string | null;
}): Promise<{
  client: MCPClient | null;
  tools: ToolSet;
}> {
  if (!args.appOrigin) {
    logger.warn("Canvas MCP disabled: app origin unavailable", {
      userId: args.userId,
    });
    return { client: null, tools: {} };
  }

  const client = await createMCPClient({
    transport: {
      type: "http",
      url: `${args.appOrigin}/api/mcp/canvas`,
      headers: {
        Authorization: `Bearer ${createInternalMcpToken(args.userId)}`,
      },
      redirect: "error",
    },
  });

  const tools = await client.tools({
    schemas: canvasMcpToolSchemas,
  });

  return { client, tools };
}
