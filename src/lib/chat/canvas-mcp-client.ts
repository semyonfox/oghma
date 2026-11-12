import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import type { ToolSet } from "ai";
import { canvasMcpToolSchemas, canvasToolInstruction } from "@/lib/canvas/mcp";
import { createInternalMcpToken } from "@/lib/auth/internal-mcp-token";
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

// a Canvas page, file listing or discussion can be far bigger than anything
// chat should pay to read back on every later step. same ceiling as readNote
export const CANVAS_TOOL_RESULT_MAX_CHARS = 20_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// trims the text parts of an MCP tool result to one shared budget and says so,
// so the model knows to ask for less instead of guessing at what was cut
export function capCanvasToolResult(result: unknown): unknown {
  if (!isRecord(result) || !Array.isArray(result.content)) return result;
  let budget = CANVAS_TOOL_RESULT_MAX_CHARS;
  let cut = 0;
  const content = result.content.map((part: unknown) => {
    if (!isRecord(part) || part.type !== "text" || typeof part.text !== "string") return part;
    const kept = part.text.slice(0, Math.max(budget, 0));
    cut += part.text.length - kept.length;
    budget -= kept.length;
    return { ...part, text: kept };
  });
  if (cut === 0) return result;
  return {
    ...result,
    content: [
      ...content,
      { type: "text", text: `[truncated: ${cut} more characters. Ask for a narrower result, such as one page or a smaller page size.]` },
    ],
  };
}

function capToolResults(tools: ToolSet): ToolSet {
  return Object.fromEntries(
    Object.entries(tools).map(([name, definition]) => {
      const execute = definition.execute;
      if (!execute) return [name, definition];
      return [name, {
        ...definition,
        execute: async (...args: Parameters<typeof execute>) => capCanvasToolResult(await execute(...args)),
      }];
    }),
  );
}

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

  return { client, tools: capToolResults(tools) };
}
