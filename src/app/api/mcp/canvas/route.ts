import { readBoundedBody, BodyTooLargeError } from "@/lib/http/bounded-body";
import { NextRequest, NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import logger from "@/lib/logger";
import { loadCanvasCredentials } from "@/lib/canvas/credentials";
import {
  createCanvasMcpServer,
  createUserCanvasClient,
} from "@/lib/canvas/mcp";
import { verifyInternalMcpToken } from "@/lib/auth/internal-mcp-token";

export const dynamic = "force-dynamic";

const MAX_MCP_BODY_BYTES = 512 * 1024;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function extractBearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
}

// internal endpoint for the chat MCP client. the bearer token is minted
// server-side per user, so the Canvas connection used is always the caller's
export async function POST(request: NextRequest): Promise<Response> {
  const token = extractBearerToken(request);
  if (!token) {
    return errorResponse("Missing internal MCP token", 401);
  }

  let userId: string;
  try {
    userId = verifyInternalMcpToken(token).userId;
  } catch {
    return errorResponse("Invalid internal MCP token", 401);
  }

  // stateless: one server and transport per request, closed in finally
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  let server: ReturnType<typeof createCanvasMcpServer> | undefined;

  try {
    const credentials = await loadCanvasCredentials(userId);
    if (!credentials) {
      return errorResponse("Canvas account not connected", 403);
    }
    const bytes = await readBoundedBody(request, MAX_MCP_BODY_BYTES);
    server = createCanvasMcpServer(
      createUserCanvasClient(credentials),
      userId,
    );
    await server.connect(transport);
    return await transport.handleRequest(
      new Request(request.url, {
        method: "POST",
        headers: request.headers,
        body: bytes,
      }),
    );
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return errorResponse("Request body too large", 413);
    }
    logger.error("Canvas MCP request failed", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse("Canvas MCP request failed", 500);
  } finally {
    await transport.close().catch(() => {});
    await server?.close().catch(() => {});
  }
}
