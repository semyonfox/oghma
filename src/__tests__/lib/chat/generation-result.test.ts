import { describe, expect, it } from "vitest";
import type { StepResult, TextStreamPart, ToolSet } from "ai";

import {
  appendChatGenerationText,
  applyChatGenerationEvent,
  buildChatGenerationFromSteps,
  buildChatGenerationMetadata,
  createChatGenerationResult,
  finalizeChatGenerationResult,
  finishChatGenerationStep,
} from "@/lib/chat/generation-result";

function streamPart(
  value: Record<string, unknown>,
): TextStreamPart<ToolSet> {
  return value as TextStreamPart<ToolSet>;
}

function completedStep(
  content: Array<Record<string, unknown>>,
  finishReason: "stop" | "tool-calls",
): StepResult<ToolSet> {
  return {
    content,
    finishReason,
    rawFinishReason: finishReason,
  } as unknown as StepResult<ToolSet>;
}

function persistedShape(result: ReturnType<typeof createChatGenerationResult>) {
  return {
    reply: result.reply,
    thinking: result.thinking,
    finishReason: result.finishReason,
    rawFinishReason: result.rawFinishReason,
    stepCount: result.stepCount,
    toolCallCount: result.toolCallCount,
    parts: result.parts,
  };
}

describe("chat generation result parity", () => {
  it("accumulates equivalent streaming and completed results identically", () => {
    const events = [
      streamPart({ type: "reasoning-delta", id: "r1", text: "Think." }),
      streamPart({ type: "text-delta", id: "t1", text: "Checking. " }),
      streamPart({
        type: "tool-call",
        toolName: "searchNotes",
        toolCallId: "call-1",
        input: { query: "topic" },
        dynamic: true,
      }),
      streamPart({
        type: "tool-result",
        toolName: "searchNotes",
        toolCallId: "call-1",
        input: { query: "topic" },
        output: { matches: 2 },
        dynamic: true,
      }),
      streamPart({
        type: "finish-step",
        finishReason: "tool-calls",
        rawFinishReason: "tool_calls",
      }),
      streamPart({ type: "text-delta", id: "t2", text: "Final answer." }),
      streamPart({
        type: "finish-step",
        finishReason: "stop",
        rawFinishReason: "stop",
      }),
      streamPart({
        type: "finish",
        finishReason: "stop",
        rawFinishReason: "stop",
      }),
    ];
    let streamed = createChatGenerationResult();
    for (const event of events) {
      streamed = applyChatGenerationEvent(streamed, event, 2_000).result;
    }
    streamed = finalizeChatGenerationResult(streamed, 4, 2_000).result;

    const completed = finalizeChatGenerationResult(
      buildChatGenerationFromSteps([], [
        completedStep(
          [
            { type: "reasoning", text: "Think." },
            { type: "text", text: "Checking. " },
            {
              type: "tool-call",
              toolName: "searchNotes",
              toolCallId: "call-1",
              input: { query: "topic" },
              dynamic: true,
            },
            {
              type: "tool-result",
              toolName: "searchNotes",
              toolCallId: "call-1",
              input: { query: "topic" },
              output: { matches: 2 },
              dynamic: true,
            },
          ],
          "tool-calls",
        ),
        completedStep([{ type: "text", text: "Final answer." }], "stop"),
      ]),
      4,
      2_000,
    ).result;

    expect(persistedShape(streamed)).toEqual(persistedShape(completed));
    expect(buildChatGenerationMetadata(streamed)).toMatchObject({
      thinking: "Think.",
      stepCount: 2,
      toolCallCount: 1,
      finishReason: "stop",
    });
  });

  it("uses tool-call count rather than step count for the limit decision", () => {
    const generation = buildChatGenerationFromSteps([], [
      completedStep([{ type: "text", text: "Progress." }], "stop"),
      completedStep([], "stop"),
      completedStep(
        [
          {
            type: "tool-call",
            toolName: "searchNotes",
            toolCallId: "call-1",
            input: {},
            dynamic: true,
          },
        ],
        "tool-calls",
      ),
    ]);

    expect(generation.stepCount).toBe(3);
    expect(generation.toolCallCount).toBe(1);
    expect(finalizeChatGenerationResult(generation, 2).kind).toBe("complete");
  });

  it("requires the same final-answer synthesis for reasoning-only results", () => {
    let streamed = createChatGenerationResult();
    streamed = applyChatGenerationEvent(
      streamed,
      streamPart({ type: "reasoning-delta", id: "r1", text: "Analysis" }),
    ).result;
    streamed = applyChatGenerationEvent(
      streamed,
      streamPart({
        type: "finish-step",
        finishReason: "stop",
        rawFinishReason: "stop",
      }),
    ).result;

    const completed = buildChatGenerationFromSteps([], [
      completedStep([{ type: "reasoning", text: "Analysis" }], "stop"),
    ]);

    expect(finalizeChatGenerationResult(streamed, 4).kind).toBe(
      "synthesize-final-answer",
    );
    expect(finalizeChatGenerationResult(completed, 4).kind).toBe(
      "synthesize-final-answer",
    );

    streamed = finishChatGenerationStep(
      appendChatGenerationText(streamed, "Final answer."),
      "stop",
      "stop",
    );
    expect(finalizeChatGenerationResult(streamed, 4).kind).toBe("complete");
  });
});
