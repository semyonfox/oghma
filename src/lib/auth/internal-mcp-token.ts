import jwt from "jsonwebtoken";

const INTERNAL_MCP_AUDIENCE = "internal-mcp";
const INTERNAL_MCP_SCOPE = "canvas";
const INTERNAL_MCP_EXPIRY_SECONDS = 60;

interface InternalMcpClaims {
  sub: string;
  aud: string;
  scope: string;
}

function getInternalMcpSecret(): string {
  if (process.env.MCP_INTERNAL_AUTH_SECRET?.trim()) {
    return process.env.MCP_INTERNAL_AUTH_SECRET.trim();
  }
  if (process.env.JWT_SECRET?.trim()) {
    return process.env.JWT_SECRET.trim();
  }
  throw new Error(
    "JWT_SECRET or MCP_INTERNAL_AUTH_SECRET must be set for internal MCP auth",
  );
}

export function createInternalMcpToken(userId: string): string {
  return jwt.sign(
    {
      sub: userId,
      aud: INTERNAL_MCP_AUDIENCE,
      scope: INTERNAL_MCP_SCOPE,
    } satisfies InternalMcpClaims,
    getInternalMcpSecret(),
    { expiresIn: INTERNAL_MCP_EXPIRY_SECONDS },
  );
}

export function verifyInternalMcpToken(token: string): { userId: string } {
  const payload = jwt.verify(token, getInternalMcpSecret(), {
    audience: INTERNAL_MCP_AUDIENCE,
  }) as InternalMcpClaims;

  if (payload.scope !== INTERNAL_MCP_SCOPE || !payload.sub) {
    throw new Error("Invalid internal MCP token");
  }

  return { userId: payload.sub };
}
