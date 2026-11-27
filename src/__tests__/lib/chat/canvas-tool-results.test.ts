import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@ai-sdk/mcp", () => ({
  createMCPClient: vi.fn(async () => ({
    tools: async () => ({ canvas_get_page: { description: "page", inputSchema: {}, execute: mocks.execute } }),
  })),
}));
vi.mock("@/lib/auth/internal-mcp-token", () => ({ createInternalMcpToken: () => "token" }));

import { createMCPClient } from "@ai-sdk/mcp";
import {
  CANVAS_TOOL_RESULT_MAX_CHARS,
  capCanvasToolResult,
  createCanvasMcpTools,
  redactCanvasCredentialUrls,
} from "@/lib/chat/canvas-mcp-client";

const text = (value: string) => ({ type: "text", text: value });

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("Canvas MCP origin", () => {
  it.each([
    ["https://app.example.test/path", "https://auth.example.test", "https://app.example.test"],
    [undefined, "https://auth.example.test/path", "https://auth.example.test"],
    [undefined, undefined, null],
  ])("uses the configured HTTP origin", async (appUrl, authUrl, origin) => {
    vi.stubEnv("APP_BASE_URL", appUrl ?? undefined);
    vi.stubEnv("NEXTAUTH_URL", authUrl ?? undefined);

    const result = await createCanvasMcpTools({ userId: "user-1" });

    if (origin) {
      expect(createMCPClient).toHaveBeenCalledWith({
        transport: expect.objectContaining({ url: `${origin}/api/mcp/canvas` }),
      });
    } else {
      expect(result).toEqual({ client: null, tools: {} });
      expect(createMCPClient).not.toHaveBeenCalled();
    }
  });
});

describe("Canvas credential redaction", () => {
  it("strips pre-authenticated download verifiers before the model sees them", () => {
    const signed = "https://canvas.example/files/42/download?download_frd=1&verifier=secret-token&x=1";
    expect(redactCanvasCredentialUrls(signed)).toBe(
      "https://canvas.example/files/42/download?download_frd=1&verifier=[redacted]&x=1",
    );
    const capped = capCanvasToolResult({
      content: [text(JSON.stringify({ url: signed, html_url: "https://canvas.example/courses/1/files/42" }))],
    });
    expect(JSON.stringify(capped)).not.toContain("secret-token");
    expect(JSON.stringify(capped)).toContain("https://canvas.example/courses/1/files/42");
  });

  it("strips verifiers hidden by HTML escapes and percent-encoding", () => {
    expect(redactCanvasCredentialUrls("download?wrap=1&amp;verifier=SECRET")).toBe(
      "download?wrap=1&amp;verifier=[redacted]",
    );
    expect(redactCanvasCredentialUrls("&#38;access_token=SECRET")).toBe("&#38;access_token=[redacted]");
    expect(redactCanvasCredentialUrls("&#x26;token=SECRET")).toBe("&#x26;token=[redacted]");
    expect(redactCanvasCredentialUrls("\\u0026sf_verifier=SECRET")).toBe("\\u0026sf_verifier=[redacted]");
    const encoded = "fallback_url=https%3A%2F%2Fcanvas.example%2Ffiles%2F1%3Fverifier%3DSECRET%26x%3D1";
    expect(redactCanvasCredentialUrls(encoded)).toBe(
      "fallback_url=https%3A%2F%2Fcanvas.example%2Ffiles%2F1%3Fverifier%3D[redacted]%26x%3D1",
    );
    expect(redactCanvasCredentialUrls(encoded)).not.toContain("SECRET");
  });
});

describe("Canvas tool result cap", () => {
  it("leaves a result inside the budget untouched", () => {
    const result = { content: [text("short page")] };
    expect(capCanvasToolResult(result)).toBe(result);
  });

  it("shares one budget across text parts and says how much was cut", () => {
    const half = "a".repeat(CANVAS_TOOL_RESULT_MAX_CHARS / 2 + 100);
    const capped = capCanvasToolResult({ content: [text(half), text(half), { type: "image", data: "x" }] });
    if (typeof capped !== "object" || capped === null || !("content" in capped) || !Array.isArray(capped.content)) {
      throw new Error("expected an MCP result");
    }
    const texts = capped.content.flatMap((part: unknown) =>
      typeof part === "object" && part !== null && "text" in part && typeof part.text === "string" ? [part.text] : [],
    );
    expect(texts.slice(0, 2).join("").length).toBe(CANVAS_TOOL_RESULT_MAX_CHARS);
    expect(texts.at(-1)).toContain("truncated: 200 more characters");
    expect(capped.content).toContainEqual({ type: "image", data: "x" });
  });

  it("is applied to every Canvas tool chat receives", async () => {
    vi.stubEnv("APP_BASE_URL", "https://example.test");
    mocks.execute.mockResolvedValue({ content: [text("b".repeat(CANVAS_TOOL_RESULT_MAX_CHARS * 3))] });
    const { tools } = await createCanvasMcpTools({ userId: "user-1" });
    const execute = tools.canvas_get_page?.execute;
    if (!execute) throw new Error("missing tool");
    const result: unknown = await Reflect.apply(execute, undefined, [{}, { toolCallId: "call", messages: [] }]);
    expect(JSON.stringify(result).length).toBeLessThan(CANVAS_TOOL_RESULT_MAX_CHARS + 500);
  });
});
