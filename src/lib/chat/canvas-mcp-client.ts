import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import type { ToolSet } from "ai";
import { canvasMcpToolSchemas, canvasToolInstruction } from "@/lib/canvas/mcp";
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

export { canvasToolInstruction };

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
