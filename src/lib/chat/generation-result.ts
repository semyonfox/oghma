import type {
  FinishReason,
  StepResult,
  TextStreamPart,
  ToolSet,
} from "ai";

import type { MessageMetadata, MessagePart } from "@/lib/chat/types";
import { labelForTool } from "@/lib/chat/tool-labels";
import {
  noteSearchDetail,
  toolCallDetail,
  toolResultDetail,
} from "@/lib/chat/tool-display";
import { shouldSynthesizeFinalAnswer } from "@/lib/chat/final-answer";
import {
  appendToolCallLimitMessage,
  isToolCallLimitFinish,
} from "@/lib/chat/tool-budget";

export interface ChatGenerationResult {
  reply: string;
  thinking: string;
  thinkingStartedAt: number | null;
  thinkingDuration?: number;
  finishReason?: FinishReason;
  rawFinishReason?: string;
  stepCount: number;
  toolCallCount: number;
  parts: MessagePart[];
  pendingText: string;
}

export type ChatGenerationEffect =
  | { type: "none" }
  | { type: "thinking"; text: string }
  | { type: "text"; text: string }
  | {
      type: "tool-call";
      toolName: string;
      toolCallId: string;
      detail?: string;
    }
  | { type: "tool-result"; toolCallId: string; detail?: string }
  | { type: "abort" }
  | { type: "error"; error: unknown };

export interface ChatGenerationUpdate {
  result: ChatGenerationResult;
  effect: ChatGenerationEffect;
}

export type ChatGenerationFinalization =
  | { kind: "complete"; result: ChatGenerationResult }
  | {
      kind: "tool-call-limit";
      result: ChatGenerationResult;
      delta: string;
    }
  | { kind: "synthesize-final-answer"; result: ChatGenerationResult }
  | { kind: "invalid"; result: ChatGenerationResult; error: string };

interface SearchResultTitle {
  title?: string | null;
}

export function buildInitialChatParts(
  useRag: boolean,
  message: string,
  searchResults: readonly SearchResultTitle[],
): MessagePart[] {
  if (!useRag) return [];
  return [
    {
      type: "tool",
      name: "ragSearch",
      label: "Searched notes",
      detail: noteSearchDetail(
        message,
        searchResults.map(({ title }) => ({ title: title || "Untitled" })),
      ),
    },
  ];
}

export function createChatGenerationResult(
  parts: MessagePart[] = [],
): ChatGenerationResult {
  return {
    reply: "",
    thinking: "",
    thinkingStartedAt: null,
    stepCount: 0,
    toolCallCount: 0,
    parts,
    pendingText: "",
  };
}

export function flushChatGenerationText(
  result: ChatGenerationResult,
): ChatGenerationResult {
  if (!result.pendingText) return result;
  return {
    ...result,
    parts: [...result.parts, { type: "text", text: result.pendingText }],
    pendingText: "",
  };
}

export function closeChatThinkingWindow(
  result: ChatGenerationResult,
  now = Date.now(),
): ChatGenerationResult {
  if (result.thinkingStartedAt === null || result.thinkingDuration != null) {
    return result;
  }
  return {
    ...result,
    thinkingDuration: Math.max(
      1,
      Math.round((now - result.thinkingStartedAt) / 1000),
    ),
  };
}

export function appendChatGenerationText(
  current: ChatGenerationResult,
  text: string,
  now = Date.now(),
): ChatGenerationResult {
  const result = closeChatThinkingWindow(current, now);
  return {
    ...result,
    reply: result.reply + text,
    pendingText: result.pendingText + text,
  };
}

export function finishChatGenerationStep(
  result: ChatGenerationResult,
  finishReason: FinishReason | undefined,
  rawFinishReason: string | undefined,
): ChatGenerationResult {
  return {
    ...result,
    stepCount: result.stepCount + 1,
    finishReason,
    rawFinishReason,
  };
}

export function applyChatGenerationEvent(
  current: ChatGenerationResult,
  event: TextStreamPart<ToolSet>,
  now = Date.now(),
): ChatGenerationUpdate {
  if (event.type === "reasoning-delta") {
    return {
      result: {
        ...current,
        thinkingStartedAt: current.thinkingStartedAt ?? now,
        thinking: current.thinking + event.text,
      },
      effect: { type: "thinking", text: event.text },
    };
  }

  if (event.type === "text-delta") {
    const result = appendChatGenerationText(current, event.text, now);
    return {
      result,
      effect: { type: "text", text: event.text },
    };
  }

  if (event.type === "tool-call") {
    const result = flushChatGenerationText(current);
    const detail = toolCallDetail(event.toolName, event.input);
    return {
      result: {
        ...result,
        toolCallCount: result.toolCallCount + 1,
        parts: [
          ...result.parts,
          {
            type: "tool",
            name: event.toolName,
            label: labelForTool(event.toolName),
            callId: event.toolCallId,
            detail,
          },
        ],
      },
      effect: {
        type: "tool-call",
        toolName: event.toolName,
        toolCallId: event.toolCallId,
        detail,
      },
    };
  }

  if (event.type === "tool-result") {
    const detail = toolResultDetail(event.toolName, event.output);
    return {
      result: {
        ...current,
        parts: detail
          ? current.parts.map((part) =>
              part.type === "tool" && part.callId === event.toolCallId
                ? { ...part, detail }
                : part,
            )
          : current.parts,
      },
      effect: {
        type: "tool-result",
        toolCallId: event.toolCallId,
        detail,
      },
    };
  }

  if (event.type === "finish-step") {
    return {
      result: finishChatGenerationStep(
        current,
        event.finishReason,
        event.rawFinishReason,
      ),
      effect: { type: "none" },
    };
  }

  if (event.type === "finish") {
    return {
      result: {
        ...current,
        finishReason: event.finishReason,
        rawFinishReason: event.rawFinishReason,
      },
      effect: { type: "none" },
    };
  }

  if (event.type === "abort") {
    return { result: current, effect: { type: "abort" } };
  }
  if (event.type === "error") {
    return { result: current, effect: { type: "error", error: event.error } };
  }
  return { result: current, effect: { type: "none" } };
}

/** Replays a completed SDK result through the same accumulator as a stream. */
export function buildChatGenerationFromSteps(
  initialParts: MessagePart[],
  steps: readonly StepResult<ToolSet>[],
): ChatGenerationResult {
  let result = createChatGenerationResult(initialParts);

  for (const step of steps) {
    for (const content of step.content) {
      if (content.type === "reasoning") {
        result = { ...result, thinking: result.thinking + content.text };
      } else if (content.type === "text") {
        result = {
          ...result,
          reply: result.reply + content.text,
          pendingText: result.pendingText + content.text,
        };
      } else if (
        content.type === "tool-call" &&
        typeof content.toolName === "string"
      ) {
        result = applyChatGenerationEvent(result, {
          ...content,
          type: "tool-call",
          toolName: content.toolName,
          toolCallId: content.toolCallId,
          input: content.input,
          dynamic: true,
        }).result;
      } else if (
        content.type === "tool-result" &&
        typeof content.toolName === "string"
      ) {
        result = applyChatGenerationEvent(result, {
          ...content,
          type: "tool-result",
          toolName: content.toolName,
          toolCallId: content.toolCallId,
          input: content.input,
          output: content.output,
          dynamic: true,
        }).result;
      }
    }
    result = {
      ...result,
      stepCount: result.stepCount + 1,
      finishReason: step.finishReason,
      rawFinishReason: step.rawFinishReason,
    };
  }

  return flushChatGenerationText(result);
}

export function finalizeChatGenerationResult(
  current: ChatGenerationResult,
  maxToolSteps: number,
  now = Date.now(),
): ChatGenerationFinalization {
  const result = flushChatGenerationText(
    closeChatThinkingWindow(current, now),
  );

  if (
    isToolCallLimitFinish(
      result.finishReason,
      result.toolCallCount,
      maxToolSteps,
    )
  ) {
    const notice = appendToolCallLimitMessage(result.reply);
    return {
      kind: "tool-call-limit",
      result: {
        ...result,
        reply: notice.reply,
        parts: [...result.parts, { type: "text", text: notice.delta }],
      },
      delta: notice.delta,
    };
  }

  if (shouldSynthesizeFinalAnswer(result.reply, result.finishReason)) {
    return { kind: "synthesize-final-answer", result };
  }
  if (!result.reply.trim()) {
    return {
      kind: "invalid",
      result,
      error: `Model ended without an answer (${result.finishReason})`,
    };
  }
  return { kind: "complete", result };
}

export function buildChatGenerationMetadata(
  result: ChatGenerationResult,
  overrides: Partial<MessageMetadata> = {},
): MessageMetadata {
  return {
    ...(result.thinking && { thinking: result.thinking }),
    ...(result.thinkingDuration != null && {
      thinkingDuration: result.thinkingDuration,
    }),
    ...(result.finishReason && { finishReason: result.finishReason }),
    ...(result.rawFinishReason && {
      rawFinishReason: result.rawFinishReason,
    }),
    stepCount: result.stepCount,
    toolCallCount: result.toolCallCount,
    ...overrides,
  };
}
