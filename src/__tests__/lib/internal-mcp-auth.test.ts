import { describe, expect, it } from "vitest";
import {
  createInternalMcpToken,
  verifyInternalMcpToken,
} from "@/lib/mcp/internal-auth";

describe("internal MCP auth", () => {
  it("round-trips a short-lived token", () => {
    const token = createInternalMcpToken("user-123");
    expect(verifyInternalMcpToken(token)).toEqual({ userId: "user-123" });
  });

  it("rejects an invalid token", () => {
    expect(() => verifyInternalMcpToken("not-a-token")).toThrow();
  });
});
