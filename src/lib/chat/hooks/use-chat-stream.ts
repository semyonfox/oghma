"use client";

import { useState, useRef, useCallback } from "react";
import { parseSseBlocks } from "@/lib/chat/sse";
import { parseSseFrame } from "@/lib/chat/parse-sse-frame";
import type { MessageUpdate } from "@/lib/chat/parse-sse-frame";
import type { LlmThinkingMode } from "@/lib/ai-config";
import { toFriendlyChatError } from "@/lib/friendly-errors";
import type { Message, MessagePart, ChatContextItem } from "@/lib/chat/types";

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function logChatStream(
  level: "debug" | "info" | "warn" | "error",
  message: string,
  details: Record<string, unknown> = {},
): void {
  if (typeof console === "undefined") return;
  const logger = console[level] ?? console.log;
  logger(`[chat-stream] ${message}`, details);
}

interface UseChatStreamOptions {
  /** translate function from i18n */
  t: (key: string) => string;
  noteId?: string;
  noteTitle?: string;
  selectedNotes: ChatContextItem[];
  selectedFolders: ChatContextItem[];
  thinkingMode: LlmThinkingMode;
  onSessionCreated?: (sessionId: string, title: string) => void;
  /** called when a stream completes — useful for refreshing session list order */
  onStreamComplete?: () => void;
}

interface UseChatStreamResult {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  sessionId: string | null;
  setSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  loading: boolean;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  send: (
    text: string,
    history: { role: string; content: string }[],
  ) => Promise<void>;
  cancel: () => void;
}

/**
 * Append a token to the trailing text part, or open a new one if the last
 * part is a tool indicator. Returns a new array (immutable update).
 */
function appendTokenPart(parts: MessagePart[], text: string): MessagePart[] {
  const last = parts[parts.length - 1];
  if (last && last.type === "text") {
    return [
      ...parts.slice(0, -1),
      { type: "text", text: last.text + text },
    ];
  }
  return [...parts, { type: "text", text }];
}

/** apply a parsed SSE update to the assistant message being streamed */
export function applyUpdate(
  msg: Message,
  update: MessageUpdate,
  thinkingStartRef: React.MutableRefObject<number | null>,
): Message {
  switch (update.type) {
    case "meta": {
      const changes: Partial<Message> = {};
      if (update.sources) changes.sources = update.sources;
      if (update.retrieval) changes.retrieval = update.retrieval;
      return { ...msg, ...changes };
    }

    case "search":
      return { ...msg, searchContext: update.searchContext };

    case "thinking": {
      if (!thinkingStartRef.current) {
        thinkingStartRef.current = Date.now();
      }
      return { ...msg, thinking: `${msg.thinking ?? ""}${update.text}` };
    }

    case "token": {
      const duration = thinkingStartRef.current
        ? Math.round((Date.now() - thinkingStartRef.current) / 1000)
        : undefined;
      if (thinkingStartRef.current) thinkingStartRef.current = null;
      return {
        ...msg,
        content: `${msg.content}${update.text}`,
        parts: appendTokenPart(msg.parts ?? [], update.text),
        thinkingDuration: msg.thinkingDuration ?? duration,
      };
    }

    case "tool-call": {
      // tool calls land as their own part — message-bubble renders these via
      // ToolCallPill rather than baking markdown into content. content stays
      // the plain prose concat (drives copy button + LLM history).
      return {
        ...msg,
        parts: [
          ...(msg.parts ?? []),
          { type: "tool", name: update.toolName, label: update.label },
        ],
      };
    }

    case "error":
      return {
        ...msg,
        partial: true,
        error: update.message,
        parts: [
          ...(msg.parts ?? []),
          {
            type: "error",
            text: update.message || "Response interrupted.",
          },
        ],
      };

    default:
      return msg;
  }
}

function clearDraft(sid: string | null): void {
  if (!sid) return;
  try {
    sessionStorage.removeItem(`chat-draft:${sid}`);
  } catch {
    // ignore
  }
}

export function useChatStream(
  options: UseChatStreamOptions,
): UseChatStreamResult {
  const {
    t,
    noteId,
    noteTitle,
    selectedNotes,
    selectedFolders,
    thinkingMode,
    onSessionCreated,
    onStreamComplete,
  } = options;

  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const thinkingStartRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setLoading(false);
    // trim trailing empty assistant message if nothing was streamed yet
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant" && !last.content.trim() && !last.thinking) {
        return prev.slice(0, -1);
      }
      return prev;
    });
  }, []);

  // stable ref for sessionId so stream handlers see the latest value
  const sessionIdRef = useRef<string | null>(null);
  sessionIdRef.current = sessionId;

  const send = useCallback(
    async (text: string, history: { role: string; content: string }[]) => {
      if (!text || loading) return;

      setError(null);
      thinkingStartRef.current = null;

      const userMsg: Message = {
        id: makeId(),
        role: "user",
        content: text,
        parts: [{ type: "text", text }],
        timestamp: Date.now(),
      };
      const assistantId = makeId();
      const assistantMsg: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        parts: [],
        sources: [],
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setLoading(true);

      try {
        const { endpoint, headers } = await resolveEndpoint();

        const controller = new AbortController();
        abortControllerRef.current = controller;
        logChatStream("info", "starting request", {
          endpoint,
          assistantId,
          hasSessionId: Boolean(sessionId),
          noteCount: selectedNotes.length,
          folderCount: selectedFolders.length,
          thinkingMode,
        });

        const res = await fetch(endpoint, {
          method: "POST",
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            message: text,
            noteId,
            noteTitle,
            noteIds: selectedNotes.map((n) => n.id),
            folderIds: selectedFolders.map((f) => f.id),
            selectedNotes,
            selectedFolders,
            sessionId,
            history,
            stream: true,
            thinkingMode,
            clientDateTime: (() => {
              const d = new Date();
              const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
              const off = -d.getTimezoneOffset();
              const s = off >= 0 ? "+" : "-";
              const h = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0");
              const m = String(Math.abs(off) % 60).padStart(2, "0");
              return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}${s}${h}:${m}[${tz}]`;
            })(),
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Server error ${res.status}`);
        }

        const contentType = res.headers.get("Content-Type") || "";

        // non-streaming JSON fallback
        if (contentType.includes("application/json")) {
          const data = await res.json();
          handleNewSession(data.sessionId, text);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: data.reply || "",
                    parts: data.reply ? [{ type: "text", text: data.reply }] : [],
                    thinking: data.thinking || undefined,
                    sources: Array.isArray(data.sources) ? data.sources : [],
                    retrieval: data.retrieval,
                    searchContext: data.searchContext ?? undefined,
                    timestamp: Date.now(),
                  }
                : m,
            ),
          );
          clearDraft(data.sessionId || sessionIdRef.current);
          onStreamComplete?.();
          return;
        }

        if (!res.body) {
          throw new Error("Missing stream body");
        }

        const { timeBlockChanged } = await consumeStream(res.body, assistantId, text);
        logChatStream("info", "stream completed", {
          assistantId,
          sessionId: sessionIdRef.current,
        });
        const completionTime = Date.now();
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, timestamp: completionTime } : m,
          ),
        );
        if (timeBlockChanged) {
          window.dispatchEvent(new CustomEvent("oghma:time-block-changed"));
        }
        clearDraft(sessionIdRef.current);
        onStreamComplete?.();
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          logChatStream("warn", "request aborted by client", {
            assistantId,
            sessionId: sessionIdRef.current,
          });
          return;
        }
        const errMsg =
          err instanceof Error ? err.message : t("error.something_went_wrong");
        logChatStream("error", "stream failed", {
          assistantId,
          sessionId: sessionIdRef.current,
          error: errMsg,
        });
        const friendlyMessage = toFriendlyChatError(errMsg);
        setError(
          friendlyMessage.includes("temporarily unavailable")
            ? t("error.ai_unavailable")
            : t("error.something_went_wrong"),
        );
      } finally {
        abortControllerRef.current = null;
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      noteId,
      noteTitle,
      selectedNotes,
      selectedFolders,
      sessionId,
      thinkingMode,
      loading,
    ],
  );

  /** resolve the chat endpoint — homelab streams via /api/chat (no Lambda) */
  async function resolveEndpoint(): Promise<{
    endpoint: string;
    headers: Record<string, string>;
  }> {
    return {
      endpoint: "/api/chat",
      headers: { "Content-Type": "application/json" },
    };
  }

  /** handle session ID from server responses */
  function handleNewSession(
    newSessionId: string | undefined,
    userText: string,
  ): void {
    if (newSessionId && newSessionId !== sessionIdRef.current) {
      setSessionId(newSessionId);
      onSessionCreated?.(newSessionId, userText.slice(0, 60));
    }
  }

  /** read the SSE stream and apply updates to the assistant message */
  async function consumeStream(
    body: ReadableStream<Uint8Array>,
    assistantId: string,
    userText: string,
  ): Promise<{ timeBlockChanged: boolean }> {
    let timeBlockChanged = false;
    let sawDone = false;
    let frameCount = 0;
    const reader = body.getReader();
    const decoder = new TextDecoder();
    const parseState = { buffer: "" };

    while (true) {
      const { value, done } = await reader.read();
      const chunk = done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });

      if (chunk) {
        for (const frame of parseSseBlocks(chunk, parseState)) {
          frameCount += 1;
          const update = parseSseFrame(frame);
          if (!update) continue;

          if (update.type === "done") {
            sawDone = true;
            logChatStream("debug", "received done event", {
              assistantId,
              frameCount,
            });
            continue;
          }

          if (update.type === "error") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? applyUpdate(m, update, thinkingStartRef)
                  : m,
              ),
            );
            throw new Error(update.message || t("error.something_went_wrong"));
          }

          if (update.type === "meta") {
            handleNewSession(update.sessionId, userText);
            logChatStream("debug", "received metadata", {
              assistantId,
              sessionId: update.sessionId,
              sources: update.sources?.length ?? 0,
            });
          }

          if (
            update.type === "tool-call" &&
            (update.toolName === "addTimeBlock" ||
              update.toolName === "completeTimeBlock")
          ) {
            timeBlockChanged = true;
          }

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? applyUpdate(m, update, thinkingStartRef)
                : m,
            ),
          );
        }
      }

      if (done) break;

      // yield to the macrotask queue so React can flush pending renders
      await new Promise<void>((r) => setTimeout(r, 0));
    }
    if (!sawDone) {
      logChatStream("warn", "stream ended without done event", {
        assistantId,
        frameCount,
        bufferedBytes: parseState.buffer.length,
      });
      throw new Error("Response stream ended before completion");
    }
    return { timeBlockChanged };
  }

  return {
    messages,
    setMessages,
    sessionId,
    setSessionId,
    loading,
    error,
    setError,
    send,
    cancel,
  };
}
