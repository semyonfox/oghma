import { afterEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import {
  createInternalMcpToken,
  verifyInternalMcpToken,
} from "@/lib/auth/internal-mcp-token";

const USER_ID = "4f0c5b8e-7c1d-4a3e-9b2a-1d2e3f4a5b6c";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("internal MCP auth", () => {
  it("round-trips a token scoped to one user", () => {
    const token = createInternalMcpToken(USER_ID);
    expect(verifyInternalMcpToken(token)).toEqual({ userId: USER_ID });
  });

  it("rejects an invalid token", () => {
    expect(() => verifyInternalMcpToken("not-a-token")).toThrow();
  });

  it("outlives a long multi-step chat generation but still expires", () => {
    vi.useFakeTimers();
    const token = createInternalMcpToken(USER_ID);

    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(verifyInternalMcpToken(token)).toEqual({ userId: USER_ID });

    vi.advanceTimersByTime(6 * 60 * 1000);
    expect(() => verifyInternalMcpToken(token)).toThrow(/expired/);
  });

  it("does not accept other JWTs signed with the shared JWT_SECRET", () => {
    // same claims a forged or reused session-style token could carry
    const shared = jwt.sign(
      { sub: USER_ID, aud: "internal-mcp", scope: "canvas" },
      process.env.JWT_SECRET!,
      { expiresIn: 60 },
    );
    expect(() => verifyInternalMcpToken(shared)).toThrow();
  });

  it("rejects unsigned tokens and tokens without the canvas scope", () => {
    const unsigned = jwt.sign(
      { sub: USER_ID, aud: "internal-mcp", scope: "canvas" },
      "",
      { algorithm: "none" },
    );
    expect(() => verifyInternalMcpToken(unsigned)).toThrow();

    vi.stubEnv("MCP_INTERNAL_AUTH_SECRET", "dedicated-secret");
    const wrongScope = jwt.sign(
      { sub: USER_ID, aud: "internal-mcp", scope: "notes" },
      "dedicated-secret",
      { expiresIn: 60 },
    );
    expect(() => verifyInternalMcpToken(wrongScope)).toThrow(
      "Invalid internal MCP token",
    );

    const noExpiry = jwt.sign(
      { sub: USER_ID, aud: "internal-mcp", scope: "canvas" },
      "dedicated-secret",
    );
    expect(() => verifyInternalMcpToken(noExpiry)).toThrow(
      "Invalid internal MCP token",
    );
  });
});
