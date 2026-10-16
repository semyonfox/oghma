import { createHmac } from "node:crypto";
import jwt from "jsonwebtoken";

const INTERNAL_MCP_AUDIENCE = "internal-mcp";
const INTERNAL_MCP_SCOPE = "canvas";
const INTERNAL_MCP_ALGORITHM = "HS256";
// the chat MCP client mints one token per generation and reuses it for every
// tool call, so it has to outlive a long multi-step answer. it never leaves
// the server and only reaches this user's own Canvas connection
const INTERNAL_MCP_EXPIRY_SECONDS = 15 * 60;

function getInternalMcpSecret(): string | Buffer {
  const dedicated = process.env.MCP_INTERNAL_AUTH_SECRET?.trim();
  if (dedicated) return dedicated;
  const shared = process.env.JWT_SECRET?.trim();
  // derive a separate key so these tokens and other JWT_SECRET tokens can
  // never be accepted in place of each other
  if (shared) return createHmac("sha256", shared).update("internal-mcp").digest();
  throw new Error(
    "JWT_SECRET or MCP_INTERNAL_AUTH_SECRET must be set for internal MCP auth",
  );
}

export function createInternalMcpToken(userId: string): string {
  return jwt.sign({ scope: INTERNAL_MCP_SCOPE }, getInternalMcpSecret(), {
    algorithm: INTERNAL_MCP_ALGORITHM,
    audience: INTERNAL_MCP_AUDIENCE,
    subject: userId,
    expiresIn: INTERNAL_MCP_EXPIRY_SECONDS,
  });
}

export function verifyInternalMcpToken(token: string): { userId: string } {
  const payload = jwt.verify(token, getInternalMcpSecret(), {
    algorithms: [INTERNAL_MCP_ALGORITHM],
    audience: INTERNAL_MCP_AUDIENCE,
  });

  if (
    typeof payload === "string" ||
    payload.scope !== INTERNAL_MCP_SCOPE ||
    typeof payload.sub !== "string" ||
    !payload.sub ||
    typeof payload.exp !== "number"
  ) {
    throw new Error("Invalid internal MCP token");
  }

  return { userId: payload.sub };
}
