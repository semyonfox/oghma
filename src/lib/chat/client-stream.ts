import type { MessageUpdate } from "@/lib/chat/parse-sse-frame";
import { parseSseFrame } from "@/lib/chat/parse-sse-frame";
import { parseSseBlocks } from "@/lib/chat/sse";
import { noteSearchDetail } from "@/lib/chat/tool-display";
import type { Message, MessagePart } from "@/lib/chat/types";

export function logChatStream(
  level: "debug" | "info" | "warn" | "error",
  message: string,
  details: Record<string, unknown> = {},
): void {
  if (
    process.env.NODE_ENV !== "development" ||
    typeof console === "undefined"
  ) {
    return;
  }
  const logger = console[level] ?? console.log;
  logger(`[chat-stream] ${message}`, details);
}

function appendTokenPart(parts: MessagePart[], text: string): MessagePart[] {
  const last = parts[parts.length - 1];
  if (last?.type === "text") {
    return [
      ...parts.slice(0, -1),
      { type: "text", text: last.text + text },
    ];
  }
  return [...parts, { type: "text", text }];
}

/** Apply one transport update without mutating the restored/live message. */
export function applyUpdate(
  message: Message,
  update: MessageUpdate,
  thinkingStartRef: React.MutableRefObject<number | null>,
): Message {
  switch (update.type) {
    case "reset":
      thinkingStartRef.current = null;
      return {
        ...message,
        content: "",
        parts: [],
        thinking: undefined,
        thinkingDuration: undefined,
        partial: undefined,
        error: undefined,
      };
    case "meta":
      return {
        ...message,
        ...(update.sources && { sources: update.sources }),
        ...(update.retrieval && { retrieval: update.retrieval }),
      };
    case "search": {
      const query = update.searchContext.query;
      return {
        ...message,
        searchContext: update.searchContext,
        parts: query
          ? [
              ...(message.parts ?? []),
              {
                type: "tool",
                name: "ragSearch",
                label: "Searched notes",
                detail: noteSearchDetail(query, update.searchContext.results),
              },
            ]
          : message.parts,
      };
    }
    case "thinking":
      thinkingStartRef.current ??= Date.now();
      return {
        ...message,
        thinking: `${message.thinking ?? ""}${update.text}`,
      };
    case "token": {
      const duration = thinkingStartRef.current
        ? Math.round((Date.now() - thinkingStartRef.current) / 1000)
        : undefined;
      thinkingStartRef.current = null;
      return {
        ...message,
        content: message.content + update.text,
        parts: appendTokenPart(message.parts ?? [], update.text),
        thinkingDuration: message.thinkingDuration ?? duration,
      };
    }
    case "tool-call":
      return {
        ...message,
        parts: [
          ...(message.parts ?? []),
          {
            type: "tool",
            name: update.toolName,
            label: update.label,
            callId: update.toolCallId,
            detail: update.detail,
          },
        ],
      };
    case "tool-result":
      return {
        ...message,
        parts: (message.parts ?? []).map((part) =>
          part.type === "tool" && part.callId === update.toolCallId
            ? { ...part, detail: update.detail }
            : part,
        ),
      };
    case "error":
      return {
        ...message,
        partial: true,
        error: update.message,
        parts: [
          ...(message.parts ?? []),
          {
            type: "error",
            text: update.message || "Response interrupted.",
          },
        ],
      };
    default:
      return message;
  }
}

export function resolveResumeAssistantId(
  messages: Message[],
  proposedId: string,
): string {
  const last = messages[messages.length - 1];
  return last?.role === "assistant" ? last.id : proposedId;
}

interface ConsumeStreamOptions {
  body: ReadableStream<Uint8Array>;
  assistantId: string;
  userText: string;
  thinkingStartRef: React.MutableRefObject<number | null>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  onSession: (sessionId: string | undefined, userText: string) => void;
  onEventId?: (id: string) => void;
  translate: (key: string) => string;
  signal?: AbortSignal;
  isActive?: () => boolean;
}

function abortError(): DOMException {
  return new DOMException("Chat stream detached", "AbortError");
}

export async function consumeChatStream({
  body,
  assistantId,
  userText,
  thinkingStartRef,
  setMessages,
  onSession,
  onEventId,
  translate,
  signal,
  isActive = () => true,
}: ConsumeStreamOptions): Promise<{ timeBlockChanged: boolean }> {
  let timeBlockChanged = false;
  let sawDone = false;
  let completed = false;
  let frameCount = 0;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parseState = { buffer: "" };

  const detachReader = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener("abort", detachReader, { once: true });

  try {
    while (true) {
      if (signal?.aborted || !isActive()) throw abortError();
      const { value, done } = await reader.read();
      if (signal?.aborted || !isActive()) throw abortError();
      const chunk = done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });

      if (chunk) {
        for (const frame of parseSseBlocks(chunk, parseState)) {
          if (signal?.aborted || !isActive()) throw abortError();
          if (frame.id) onEventId?.(frame.id);
          frameCount += 1;
          const update = parseSseFrame(frame);
          if (!update) continue;
          if (update.type === "done") {
            sawDone = true;
            continue;
          }
          if (update.type === "error") {
            setMessages((messages) =>
              messages.map((message) =>
                message.id === assistantId
                  ? applyUpdate(message, update, thinkingStartRef)
                  : message,
              ),
            );
            throw new Error(
              update.message || translate("error.something_went_wrong"),
            );
          }
          if (update.type === "meta") onSession(update.sessionId, userText);
          if (
            update.type === "tool-call" &&
            (update.toolName === "addTimeBlock" ||
              update.toolName === "completeTimeBlock")
          ) {
            timeBlockChanged = true;
          }
          setMessages((messages) =>
            messages.map((message) =>
              message.id === assistantId
                ? applyUpdate(message, update, thinkingStartRef)
                : message,
            ),
          );
        }
      }

      if (done) break;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }

    if (!sawDone) {
      logChatStream("warn", "stream ended without done event", {
        assistantId,
        frameCount,
        bufferedBytes: parseState.buffer.length,
      });
      throw new Error("Response stream ended before completion");
    }
    completed = true;
    return { timeBlockChanged };
  } finally {
    signal?.removeEventListener("abort", detachReader);
    if (!completed) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function waitForRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export async function consumeBackgroundGeneration(input: {
  generationId: string;
  assistantId: string;
  userText: string;
  signal: AbortSignal;
  activeGenerationRef: React.MutableRefObject<string | null>;
  consumeStream: (
    body: ReadableStream<Uint8Array>,
    assistantId: string,
    userText: string,
    onEventId?: (id: string) => void,
  ) => Promise<{ timeBlockChanged: boolean }>;
}): Promise<void> {
  input.activeGenerationRef.current = input.generationId;
  let afterId = "0-0";
  let attempts = 0;
  try {
    while (!input.signal.aborted) {
      try {
        const response = await fetch(
          `/api/chat/generations/${input.generationId}/stream?after=${encodeURIComponent(afterId)}`,
          { headers: { Accept: "text/event-stream" }, signal: input.signal },
        );
        if (!response.ok || !response.body) {
          throw new Error(`Unable to resume response (${response.status})`);
        }
        await input.consumeStream(
          response.body,
          input.assistantId,
          input.userText,
          (id) => {
            afterId = id;
          },
        );
        return;
      } catch (error) {
        if (input.signal.aborted) throw error;
        attempts += 1;
        if (attempts >= 4) throw error;
        await waitForRetry(attempts * 500, input.signal);
      }
    }
  } finally {
    if (input.activeGenerationRef.current === input.generationId) {
      input.activeGenerationRef.current = null;
    }
  }
}
