import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";

const mocks = vi.hoisted(() => ({
  normalizeScope: vi.fn(),
  buildLlmCall: vi.fn(),
  persistMessage: vi.fn(),
  markFailed: vi.fn(),
}));

vi.mock("@/lib/api-error", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireAuth: vi.fn().mockResolvedValue({
      user_id: "22222222-2222-2222-2222-222222222222",
    }),
    tracedError: (message: string, status: number) =>
      NextResponse.json({ error: message }, { status }),
    parseJsonObject: async (request: Request) => request.json(),
    withErrorHandler: (handler: unknown) => handler,
  };
});
vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/metrics", () => ({
  Metrics: { llmError: vi.fn(), llmLatency: vi.fn() },
}));
vi.mock("@/lib/chat/normalize-scope", () => ({
  normalizeScope: mocks.normalizeScope,
  buildSessionMemoryPrompt: () => "",
}));
vi.mock("@/lib/chat/build-stream", () => ({
  buildLlmCall: mocks.buildLlmCall,
}));
vi.mock("@/lib/chat/session", () => ({
  persistMessage: mocks.persistMessage,
  markChatGenerationFailed: mocks.markFailed,
}));
vi.mock("@/lib/chat/generation-store", () => ({
  createChatGeneration: vi.fn(),
  failChatGeneration: vi.fn(),
}));
vi.mock("@/lib/queue", () => ({ enqueueChatGeneration: vi.fn() }));

import { POST } from "@/app/api/chat/route";

const sessionId = "33333333-3333-3333-3333-333333333333";

function failingModel(chunks: LanguageModelV3StreamPart[]) {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream<LanguageModelV3StreamPart>({ chunks }),
    }),
  });
}

function chatRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify({ message: "hello", ...body }),
    headers: { "content-type": "application/json" },
  });
}

function useModel(model: MockLanguageModelV3) {
  mocks.buildLlmCall.mockResolvedValue({
    model,
    llmAvailable: true,
    canvasMcpClient: null,
    maxToolSteps: 3,
    llmCallOptions: {
      instructions: "system",
      messages: [{ role: "user", content: "hello" }],
      maxOutputTokens: 256,
      tools: {},
    },
  });
}

describe("inline chat delivery for API clients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeScope.mockResolvedValue({
      sessionId,
      sessionContext: {
        scope: { notes: [], folders: [] },
        recentAccesses: [],
        lastFolder: null,
      },
      scopedNoteIds: null,
      scopedInputNoteIds: [],
      history: [],
    });
    mocks.persistMessage.mockResolvedValue(undefined);
    mocks.markFailed.mockResolvedValue(undefined);
  });

  it("does not leave the session generating when the provider fails before output", async () => {
    useModel(
      failingModel([
        { type: "stream-start", warnings: [] },
        { type: "error", error: new Error("provider down") },
      ]),
    );

    const response = await POST(chatRequest({ stream: true }));
    const body = await response.text();

    expect(body).toContain("event: error");
    expect(mocks.persistMessage).not.toHaveBeenCalled();
    expect(mocks.markFailed).toHaveBeenCalledWith(sessionId);
  });

  it("saves streamed partial output and reports the interruption", async () => {
    useModel(
      failingModel([
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "t" },
        { type: "text-delta", id: "t", delta: "Partial" },
        { type: "error", error: new Error("connection reset") },
      ]),
    );

    const response = await POST(chatRequest({ stream: true }));
    const body = await response.text();

    expect(body).toContain('"text":"Partial"');
    expect(body).toContain("Partial output was saved");
    expect(mocks.persistMessage).toHaveBeenCalledWith(
      sessionId,
      "assistant",
      "Partial",
      expect.objectContaining({
        metadata: expect.objectContaining({ partial: true }),
      }),
    );
    expect(mocks.markFailed).toHaveBeenCalledWith(sessionId);
  });
});
