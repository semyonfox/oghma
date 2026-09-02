import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appendEvent: vi.fn(),
  claim: vi.fn(),
  fail: vi.fn(),
  finalize: vi.fn(),
  heartbeat: vi.fn(),
  isCancelRequested: vi.fn(),
  loggerError: vi.fn(),
  prepare: vi.fn(),
  buildLlmCall: vi.fn(),
  requeue: vi.fn(),
}));

vi.mock("ai", () => ({ streamText: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  default: {
    error: mocks.loggerError,
    info: vi.fn(),
    warn: vi.fn(),
  },
}));
vi.mock("@/lib/metrics", () => ({
  Metrics: { llmError: vi.fn(), llmLatency: vi.fn() },
}));
vi.mock("@/lib/chat/generation-store", () => ({
  appendChatGenerationEvent: mocks.appendEvent,
  claimChatGeneration: mocks.claim,
  failChatGeneration: mocks.fail,
  finalizeChatGeneration: mocks.finalize,
  heartbeatChatGeneration: mocks.heartbeat,
  isChatGenerationCancelRequested: mocks.isCancelRequested,
  requeueChatGeneration: mocks.requeue,
  resetChatGenerationEvents: vi.fn(),
}));
vi.mock("@/lib/chat/prepare-generation", () => ({
  prepareChatGeneration: mocks.prepare,
}));
vi.mock("@/lib/chat/build-stream", () => ({
  buildLlmCall: mocks.buildLlmCall,
}));
vi.mock("@/lib/chat/presence", () => ({
  hasFreshChatPresence: vi.fn().mockResolvedValue(false),
  resolveAbortReason: vi.fn().mockReturnValue(null),
}));
vi.mock("@/lib/marketing/events", () => ({
  recordActivationMilestone: vi.fn(),
}));

import { processChatGeneration } from "@/lib/chat/generate-background";

describe("background chat durability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.claim.mockResolvedValue({
      leaseToken: "44444444-4444-4444-4444-444444444444",
      generation: {
        request_payload: {
          userId: "22222222-2222-2222-2222-222222222222",
          sessionId: "33333333-3333-3333-3333-333333333333",
          message: "hello",
          scope: {
            sessionContext: {
              scope: { notes: [], folders: [] },
              recentAccesses: [],
              lastFolder: null,
            },
            scopedNoteIds: null,
            scopedInputNoteIds: [],
            history: [],
          },
          useRag: false,
          thinkingMode: "off",
          requestOrigin: "http://localhost",
          respectPrivacySignal: false,
        },
      },
    });
    mocks.heartbeat.mockResolvedValue(true);
    mocks.isCancelRequested.mockResolvedValue(false);
    mocks.prepare.mockResolvedValue({
      ragResult: { ragFailed: false, searchResults: [] },
      systemPrompt: "system",
      sessionMemoryPrompt: "",
      uniqueSources: [],
      retrieval: undefined,
      initialParts: [],
      fallbackReply: "Fallback answer",
    });
    mocks.buildLlmCall.mockResolvedValue({
      model: null,
      llmAvailable: false,
      canvasMcpClient: undefined,
      llmCallOptions: {},
      maxToolSteps: 1,
    });
    mocks.finalize.mockResolvedValue(true);
  });

  it("does not retry a model after durable finalization if event delivery fails", async () => {
    mocks.appendEvent.mockRejectedValue(new Error("Redis unavailable"));

    await expect(
      processChatGeneration("11111111-1111-1111-1111-111111111111", 1, 2),
    ).resolves.toBeUndefined();

    expect(mocks.finalize).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111",
      "44444444-4444-4444-4444-444444444444",
      "completed",
      expect.objectContaining({ content: "Fallback answer" }),
    );
    expect(mocks.requeue).not.toHaveBeenCalled();
    expect(mocks.fail).not.toHaveBeenCalled();
    expect(mocks.loggerError).toHaveBeenCalledWith(
      "Durable chat answer completed but event delivery failed",
      expect.objectContaining({ error: "Redis unavailable" }),
    );
  });
});
