import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";

const mocks = vi.hoisted(() => ({
  validateSession: vi.fn(),
  checkRateLimit: vi.fn(),
  normalizeScope: vi.fn(),
  buildLlmCall: vi.fn(),
  persistMessage: vi.fn(),
  markFailed: vi.fn(),
  createChatGeneration: vi.fn(),
  enqueueChatGeneration: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  validateSession: mocks.validateSession,
  validateSessionLite: vi.fn(),
}));
vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: mocks.checkRateLimit,
}));
vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/ai-config", () => ({
  getLlmModel: vi.fn(),
  getLlmThinkingMode: vi.fn(() => "auto"),
}));
vi.mock("@/lib/chat/normalize-scope", () => ({
  normalizeScope: mocks.normalizeScope,
  buildSessionMemoryPrompt: vi.fn(),
}));
vi.mock("@/lib/chat/system-prompt", () => ({
  buildSystemPrompt: vi.fn(),
  buildPlainSystemPrompt: vi.fn(),
}));
vi.mock("@/lib/chat/generation-store", () => ({
  createChatGeneration: mocks.createChatGeneration,
  failChatGeneration: vi.fn(),
}));
vi.mock("@/lib/metrics", () => ({
  Metrics: { llmError: vi.fn(), llmLatency: vi.fn() },
}));
vi.mock("@/lib/chat/build-stream", () => ({
  buildLlmCall: mocks.buildLlmCall,
}));
vi.mock("@/lib/chat/session", () => ({
  persistMessage: mocks.persistMessage,
  markChatGenerationFailed: mocks.markFailed,
}));
vi.mock("@/lib/queue", () => ({
  enqueueChatGeneration: mocks.enqueueChatGeneration,
}));

import { POST } from "@/app/api/chat/route";

function chatRequest(body: string) {
  return new NextRequest("http://localhost/api/chat", {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/chat request contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateSession.mockResolvedValue({
      user_id: "123e4567-e89b-42d3-a456-426614174000",
      email: "user@example.com",
    });
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.normalizeScope.mockResolvedValue({
      sessionId: "123e4567-e89b-42d3-a456-426614174001",
      sessionContext: {},
      scopedNoteIds: null,
      scopedInputNoteIds: [],
      history: [],
    });
    mocks.createChatGeneration.mockResolvedValue(
      "123e4567-e89b-42d3-a456-426614174002",
    );
    mocks.enqueueChatGeneration.mockResolvedValue(undefined);
  });

  it.each([
    ["malformed JSON", "{"],
    ["null JSON", "null"],
    ["a non-string message", JSON.stringify({ message: 42 })],
  ])("returns a traced 400 for %s before chat processing", async (_label, body) => {
    const response = await POST(chatRequest(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: expect.any(String),
      traceId: expect.stringMatching(/^(?!no-trace$).+/),
    });
    expect(mocks.normalizeScope).not.toHaveBeenCalled();
    expect(mocks.createChatGeneration).not.toHaveBeenCalled();
  });

  it("accepts the browser's null session ID before the first session exists", async () => {
    const response = await POST(
      chatRequest(
        JSON.stringify({
          message: "hello",
          sessionId: null,
          history: [],
          stream: true,
          background: true,
        }),
      ),
    );

    expect(response.status).toBe(202);
    // createChatGeneration writes the user message with the queued generation,
    // so the scope step must not write it a second time
    expect(mocks.normalizeScope).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.any(Object),
      undefined,
      "hello",
      [],
      { persistUserMessage: false },
    );
    expect(await response.json()).toEqual({
      generationId: "123e4567-e89b-42d3-a456-426614174002",
      sessionId: "123e4567-e89b-42d3-a456-426614174001",
    });
  });
});

const inlineSessionId = "33333333-3333-3333-3333-333333333333";

function failingModel(chunks: LanguageModelV3StreamPart[]) {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream<LanguageModelV3StreamPart>({ chunks }),
    }),
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
    mocks.validateSession.mockResolvedValue({
      user_id: "22222222-2222-2222-2222-222222222222",
      email: "user@example.com",
    });
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.normalizeScope.mockResolvedValue({
      sessionId: inlineSessionId,
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

    const response = await POST(chatRequest(JSON.stringify({ message: "hello", stream: true })));
    const body = await response.text();

    expect(body).toContain("event: error");
    expect(mocks.persistMessage).not.toHaveBeenCalled();
    expect(mocks.markFailed).toHaveBeenCalledWith(inlineSessionId);
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

    const response = await POST(chatRequest(JSON.stringify({ message: "hello", stream: true })));
    const body = await response.text();

    expect(body).toContain('"text":"Partial"');
    expect(body).toContain("Partial output was saved");
    expect(mocks.persistMessage).toHaveBeenCalledWith(
      inlineSessionId,
      "assistant",
      "Partial",
      expect.objectContaining({
        metadata: expect.objectContaining({ partial: true }),
      }),
    );
    expect(mocks.markFailed).toHaveBeenCalledWith(inlineSessionId);
  });
});
