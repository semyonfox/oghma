import { NextRequest, NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import logger from "@/lib/logger";
import { CanvasClient } from "@/lib/canvas-mcp/src/canvas/client";
import { loadCanvasCredentials } from "@/lib/canvas/credentials";
import { createCanvasMcpServer } from "@/lib/canvas/mcp";
import { verifyInternalMcpToken } from "@/lib/mcp/internal-auth";

export const dynamic = "force-dynamic";

function unauthorizedResponse(message: string, status = 401) {
  return NextResponse.json({ error: message }, { status });
}

function extractBearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
}

export async function POST(request: NextRequest): Promise<Response> {
  const token = extractBearerToken(request);
  if (!token) {
    return unauthorizedResponse("Missing internal MCP token");
  }

  let userId: string;
  try {
    userId = verifyInternalMcpToken(token).userId;
  } catch {
    return unauthorizedResponse("Invalid internal MCP token");
  }

  const credentials = await loadCanvasCredentials(userId);
  if (!credentials) {
    return unauthorizedResponse("Canvas account not connected", 403);
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const client = new CanvasClient({
    domain: credentials.domain,
    token: credentials.token,
  });
  const server = createCanvasMcpServer(client);

  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } catch (error) {
    logger.error("Canvas MCP request failed", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Canvas MCP request failed" },
      { status: 500 },
    );
  } finally {
    await transport.close().catch(() => {});
    await server.close().catch(() => {});
  }
}
