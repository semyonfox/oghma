import type { MCPClient } from "@ai-sdk/mcp";
import type { ToolSet } from "ai";
import { getSettingsFromS3 } from "@/lib/notes/storage/s3-storage";
import logger from "@/lib/logger";
import {
  canvasToolInstruction,
  createCanvasMcpTools,
} from "@/lib/chat/canvas-mcp-client";
import { canvasContentEnabled } from "@/lib/canvas/content-policy";

export async function getOptionalCanvasTooling(args: {
  userId: string;
  appOrigin: string | null;
}): Promise<{
  client: MCPClient | null;
  tools: ToolSet;
  instruction: string;
}> {
  if (!canvasContentEnabled()) {
    return { client: null, tools: {}, instruction: "" };
  }
  const settings = await getSettingsFromS3(args.userId);
  if (!settings?.ai_canvas_access) {
    return { client: null, tools: {}, instruction: "" };
  }

  try {
    const { client, tools } = await createCanvasMcpTools(args);
    return {
      client,
      tools,
      instruction: client ? canvasToolInstruction : "",
    };
  } catch (error) {
    logger.warn("Canvas MCP tooling unavailable", {
      userId: args.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { client: null, tools: {}, instruction: "" };
  }
}
