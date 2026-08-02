import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  validateSession: vi.fn(),
  checkRateLimit: vi.fn(),
  normalizeScope: vi.fn(),
  runRagPipeline: vi.fn(),
  createChatGeneration: vi.fn(),
  enqueueChatGeneration: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  validateSession: mocks.validateSession,
  validateSessionLite: vi.fn(),
}));
vi.mock("@/lib/rateLimiter", () => ({
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
vi.mock("@/lib/chat/rag-pipeline", () => ({
  runRagPipeline: mocks.runRagPipeline,
  buildSystemPrompt: vi.fn(),
  buildPlainSystemPrompt: vi.fn(),
  runKeywordFallback: vi.fn(),
}));
vi.mock("@/lib/chat/generation-store", () => ({
  createChatGeneration: mocks.createChatGeneration,
  failChatGeneration: vi.fn(),
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
    expect(mocks.runRagPipeline).not.toHaveBeenCalled();
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
    expect(mocks.normalizeScope).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.any(Object),
      undefined,
      "hello",
      [],
    );
  });
});
