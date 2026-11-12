import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@ai-sdk/mcp", () => ({
  createMCPClient: async () => ({
    tools: async () => ({ canvas_get_page: { description: "page", inputSchema: {}, execute: mocks.execute } }),
  }),
}));
vi.mock("@/lib/auth/internal-mcp-token", () => ({ createInternalMcpToken: () => "token" }));

import {
  CANVAS_TOOL_RESULT_MAX_CHARS,
  capCanvasToolResult,
  createCanvasMcpTools,
} from "@/lib/chat/canvas-mcp-client";

const text = (value: string) => ({ type: "text", text: value });

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
    mocks.execute.mockResolvedValue({ content: [text("b".repeat(CANVAS_TOOL_RESULT_MAX_CHARS * 3))] });
    const { tools } = await createCanvasMcpTools({ userId: "user-1", appOrigin: "https://example.test" });
    const execute = tools.canvas_get_page?.execute;
    if (!execute) throw new Error("missing tool");
    const result: unknown = await Reflect.apply(execute, undefined, [{}, { toolCallId: "call", messages: [] }]);
    expect(JSON.stringify(result).length).toBeLessThan(CANVAS_TOOL_RESULT_MAX_CHARS + 500);
  });
});
