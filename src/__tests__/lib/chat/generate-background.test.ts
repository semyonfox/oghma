import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/node";
import type { StreamedSpanJSON } from "@sentry/core";
import { monitorOperation } from "@/lib/monitoring/operations";
import { monitoringOptions } from "@/lib/monitoring/options";
import { simulateReadableStream, stepCountIs, tool } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { z } from "zod";

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
  const spans: StreamedSpanJSON[] = [];
  const errors: unknown[] = [];
  afterEach(async () => {
    await Sentry.close(1000);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    spans.length = 0;
    errors.length = 0;
    const options = monitoringOptions("worker");
    Sentry.init({
      ...options,
      dsn: "https://public@example.invalid/1",
      defaultIntegrations: false,
      tracesSampleRate: 1,
      beforeSendSpan: (span) => {
        const sanitized = options.beforeSendSpan(span);
        spans.push(sanitized);
        return sanitized;
      },
      transport: () => ({
        send: async (envelope) => {
          for (const [header, payload] of envelope[1]) {
            if (header.type === "event") errors.push(payload);
          }
          return { statusCode: 200 };
        },
        flush: async () => true,
      }),
    });
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
    mocks.appendEvent.mockResolvedValue(undefined);
    mocks.prepare.mockResolvedValue({
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
    const failure = new Error("Redis unavailable");
    mocks.appendEvent.mockRejectedValue(failure);

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
      expect.objectContaining({ error: failure }),
    );
  });

  it("preserves scoped note tools without publishing an eager search event", async () => {
    const scopedNoteId = "55555555-5555-5555-5555-555555555555";
    mocks.claim.mockResolvedValue({
      leaseToken: "44444444-4444-4444-4444-444444444444",
      generation: {
        request_payload: {
          userId: "22222222-2222-2222-2222-222222222222",
          sessionId: "33333333-3333-3333-3333-333333333333",
          message: "use my notes",
          scope: {
            sessionContext: {
              scope: {
                notes: [{ id: scopedNoteId, title: "Networks" }],
                folders: [],
              },
              recentAccesses: [],
              lastFolder: null,
            },
            scopedNoteIds: [scopedNoteId],
            scopedInputNoteIds: [scopedNoteId],
            history: [],
          },
          useRag: true,
          thinkingMode: "off",
          requestOrigin: "http://localhost",
          respectPrivacySignal: false,
        },
      },
    });

    await processChatGeneration("11111111-1111-1111-1111-111111111111");

    expect(mocks.prepare).toHaveBeenCalledWith({
      useRag: true,
      scopedNoteIds: [scopedNoteId],
      sessionContext: expect.any(Object),
    });
    expect(mocks.buildLlmCall).toHaveBeenCalledWith(
      expect.objectContaining({
        retrievalEnabled: true,
        scopedNoteIds: [scopedNoteId],
        scopedInputNoteIds: [scopedNoteId],
      }),
    );
    expect(
      mocks.appendEvent.mock.calls.some(([sse]) =>
        String(sse).includes("event: search"),
      ),
    ).toBe(false);
  });

  it("saves reasoning, tool results, and partial prose without rerunning executed tools", async () => {
    const { default: realLogger } =
      await vi.importActual<typeof import("@/lib/logger")>("@/lib/logger");
    mocks.loggerError.mockImplementationOnce(
      (message: string, metadata: Record<string, unknown>) =>
        realLogger.error(message, metadata),
    );
    const failure = new TypeError("Provider connection terminated");
    const execute = vi.fn(async () => ({
      title: "Synthetic note",
      content: "Test",
    }));
    let calls = 0;
    const model = new MockLanguageModelV3({
      doStream: async () => {
        calls++;
        return {
          stream: simulateReadableStream<LanguageModelV3StreamPart>({
            chunks:
              calls === 1
                ? [
                    { type: "stream-start", warnings: [] },
                    { type: "reasoning-start", id: "reason-1" },
                    {
                      type: "reasoning-delta",
                      id: "reason-1",
                      delta: "Check the note",
                    },
                    { type: "reasoning-end", id: "reason-1" },
                    { type: "text-start", id: "text-1" },
                    {
                      type: "text-delta",
                      id: "text-1",
                      delta: "Reading it now.",
                    },
                    { type: "text-end", id: "text-1" },
                    {
                      type: "tool-call",
                      toolCallId: "read-1",
                      toolName: "readNote",
                      input: "{}",
                    },
                    {
                      type: "finish",
                      finishReason: {
                        unified: "tool-calls",
                        raw: "tool_calls",
                      },
                      usage: {
                        inputTokens: {
                          total: 1,
                          noCache: 1,
                          cacheRead: 0,
                          cacheWrite: 0,
                        },
                        outputTokens: { total: 1, text: 1, reasoning: 0 },
                      },
                    },
                  ]
                : [
                    { type: "stream-start", warnings: [] },
                    { type: "reasoning-start", id: "reason-2" },
                    {
                      type: "reasoning-delta",
                      id: "reason-2",
                      delta: "Use the result",
                    },
                    { type: "reasoning-end", id: "reason-2" },
                    { type: "text-start", id: "text-2" },
                    {
                      type: "text-delta",
                      id: "text-2",
                      delta: "Partial answer",
                    },
                    {
                      type: "error",
                      error: failure,
                    },
                  ],
          }),
        };
      },
    });
    mocks.buildLlmCall.mockResolvedValue({
      model,
      llmAvailable: true,
      maxToolSteps: 3,
      llmCallOptions: {
        messages: [{ role: "user", content: "Synthetic question" }],
        onError: () => {},
        tools: { readNote: tool({ inputSchema: z.object({}), execute }) },
        stopWhen: stepCountIs(3),
      },
    });
    mocks.finalize.mockResolvedValue(true);
    mocks.appendEvent.mockResolvedValue(undefined);
    mocks.requeue.mockClear();
    await expect(
      monitorOperation("worker.chat", () =>
        processChatGeneration("11111111-1111-1111-1111-111111111111", 1, 3),
      ),
    ).resolves.toBeUndefined();
    await Sentry.flush(1000);
    expect(spans).toContainEqual(
      expect.objectContaining({ name: "worker.chat", status: "error" }),
    );
    expect(mocks.loggerError).toHaveBeenCalledWith(
      "Background chat generation failed",
      expect.objectContaining({ error: failure }),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      exception: {
        values: [
          expect.objectContaining({
            type: "TypeError",
            stacktrace: {
              frames: expect.arrayContaining([
                expect.objectContaining({
                  filename: expect.stringContaining(
                    "generate-background.test.ts",
                  ),
                }),
              ]),
            },
          }),
        ],
      },
    });
    expect(JSON.stringify(errors)).not.toContain(failure.message);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(mocks.requeue).not.toHaveBeenCalled();
    expect(mocks.finalize).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      "failed",
      expect.objectContaining({
        content: "Reading it now.Partial answer",
        parts: [
          { type: "reasoning", text: "Check the note" },
          { type: "text", text: "Reading it now." },
          expect.objectContaining({
            type: "tool",
            callId: "read-1",
            status: "completed",
          }),
          { type: "reasoning", text: "Use the result" },
          { type: "text", text: "Partial answer" },
          expect.objectContaining({ type: "error" }),
        ],
        metadata: expect.objectContaining({ partial: true }),
      }),
    );
    const delivery = mocks.appendEvent.mock.calls
      .map(([, event]) => String(event))
      .join("");
    expect(delivery.indexOf("Partial answer")).toBeLessThan(
      delivery.indexOf("event: error"),
    );
  });

  it("keeps explicit cancellation out of error reporting", async () => {
    mocks.isCancelRequested.mockResolvedValue(true);
    await expect(
      monitorOperation("worker.chat", () =>
        processChatGeneration("11111111-1111-1111-1111-111111111111", 1, 3),
      ),
    ).resolves.toBeUndefined();
    await Sentry.flush(1000);
    expect(spans).toContainEqual(
      expect.objectContaining({ name: "worker.chat", status: "ok" }),
    );
    expect(mocks.finalize).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "cancelled",
      null,
    );
    expect(mocks.loggerError).not.toHaveBeenCalled();
    expect(errors).toEqual([]);
    expect(mocks.requeue).not.toHaveBeenCalled();
    expect(mocks.fail).not.toHaveBeenCalled();
    expect(mocks.buildLlmCall).not.toHaveBeenCalled();
  });

  it("preserves the exception and retry when a generation fails before output", async () => {
    const failure = new TypeError("Preparation failed");
    mocks.prepare.mockRejectedValue(failure);
    mocks.requeue.mockResolvedValue(true);
    await expect(
      monitorOperation("worker.chat", () =>
        processChatGeneration("11111111-1111-1111-1111-111111111111", 1, 3),
      ),
    ).rejects.toBe(failure);
    await Sentry.flush(1000);
    expect(spans).toContainEqual(
      expect.objectContaining({ name: "worker.chat", status: "error" }),
    );
    expect(mocks.requeue).toHaveBeenCalledOnce();
    expect(mocks.fail).not.toHaveBeenCalled();
    expect(mocks.finalize).not.toHaveBeenCalled();
    expect(mocks.loggerError).toHaveBeenCalledWith(
      "Background chat generation failed",
      expect.objectContaining({ error: failure }),
    );
  });
});
