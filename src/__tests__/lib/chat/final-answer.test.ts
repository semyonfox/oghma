import { describe, expect, it, vi } from "vitest";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";

import {
  shouldSynthesizeFinalAnswer,
  streamFinalAnswer,
} from "@/lib/chat/final-answer";

const usage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: 0,
    cacheWrite: 0,
  },
  outputTokens: { total: 3, text: 3, reasoning: 0 },
};

describe("streamFinalAnswer", () => {
  it("forces a tool-free, reasoning-free synthesis and streams its text", async () => {
    const model = new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start" as const, warnings: [] },
            { type: "text-start" as const, id: "answer" },
            {
              type: "text-delta" as const,
              id: "answer",
              delta: "Final answer.",
            },
            { type: "text-end" as const, id: "answer" },
            {
              type: "finish" as const,
              finishReason: { unified: "stop" as const, raw: "stop" },
              usage,
            },
          ],
        }),
      }),
    });
    const onTextDelta = vi.fn();

    const result = await streamFinalAnswer({
      model,
      messages: [
        { role: "system", content: "Use note tools when needed." },
        { role: "user", content: "Use the search result." },
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: "search-1",
              toolName: "searchNotes",
              input: { query: "web basics" },
            },
          ],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "search-1",
              toolName: "searchNotes",
              output: {
                type: "json",
                value: { title: "JavaScript Variables" },
              },
            },
          ],
        },
      ],
      maxOutputTokens: 2048,
      onTextDelta,
    });

    expect(result).toEqual({
      text: "Final answer.",
      finishReason: "stop",
      rawFinishReason: "stop",
    });
    expect(onTextDelta).toHaveBeenCalledWith("Final answer.");
    expect(model.doStreamCalls[0]?.tools).toBeUndefined();
    expect(model.doStreamCalls[0]?.providerOptions).toMatchObject({
      openrouter: { reasoning: { enabled: false, effort: "none" } },
    });
    expect(model.doStreamCalls[0]?.prompt[0]).toMatchObject({
      role: "system",
      content: expect.stringContaining("Give the user the final answer"),
    });
    expect(model.doStreamCalls[0]?.prompt).toHaveLength(4);
  });
});

describe("shouldSynthesizeFinalAnswer", () => {
  it("recovers only a completed response with no answer text", () => {
    expect(shouldSynthesizeFinalAnswer("", "stop")).toBe(true);
    expect(shouldSynthesizeFinalAnswer("   ", undefined)).toBe(true);
    expect(shouldSynthesizeFinalAnswer("answer", "stop")).toBe(false);
    expect(shouldSynthesizeFinalAnswer("", "length")).toBe(false);
    expect(shouldSynthesizeFinalAnswer("", "tool-calls")).toBe(false);
    expect(shouldSynthesizeFinalAnswer("", "error")).toBe(false);
  });
});
