"use client";

import { useState, useRef, useCallback } from "react";
import { parseSseBlocks } from "@/lib/chat/sse";
import { parseSseFrame } from "@/lib/chat/parse-sse-frame";
import type { MessageUpdate } from "@/lib/chat/parse-sse-frame";
import type { LlmThinkingMode } from "@/lib/ai-config";
import { toFriendlyChatError } from "@/lib/friendly-errors";
import type { Message, ChatContextItem } from "@/lib/chat/types";

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
}

/** apply a parsed SSE update to the assistant message being streamed */
function applyUpdate(
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
        thinkingDuration: msg.thinkingDuration ?? duration,
      };
    }

    case "tool-call":
      return { ...msg, content: `${msg.content}\n\n*${update.label}…*\n\n` };

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
        timestamp: Date.now(),
      };
      const assistantId = makeId();
      const assistantMsg: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        sources: [],
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setLoading(true);

      try {
        const { endpoint, headers } = await resolveEndpoint();

        const res = await fetch(endpoint, {
          method: "POST",
          headers,
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
                    thinking: data.thinking || undefined,
                    sources: Array.isArray(data.sources) ? data.sources : [],
                    retrieval: data.retrieval,
                    searchContext: data.searchContext ?? undefined,
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

        await consumeStream(res.body, assistantId, text);
        clearDraft(sessionIdRef.current);
        onStreamComplete?.();
      } catch (err) {
        const errMsg =
          err instanceof Error ? err.message : t("error.something_went_wrong");
        const friendlyMessage = toFriendlyChatError(errMsg);
        setError(
          friendlyMessage.includes("temporarily unavailable")
            ? t("error.ai_unavailable")
            : t("error.something_went_wrong"),
        );
      } finally {
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

  /** resolve the chat endpoint, fetching a Lambda token when needed */
  async function resolveEndpoint(): Promise<{
    endpoint: string;
    headers: Record<string, string>;
  }> {
    const chatFunctionUrl = process.env.NEXT_PUBLIC_CHAT_URL || "";
    if (
      !chatFunctionUrl &&
      typeof window !== "undefined" &&
      window.location.hostname !== "localhost"
    ) {
      console.warn(
        "[chat] NEXT_PUBLIC_CHAT_URL not set -- falling back to /api/chat (no streaming on Amplify)",
      );
    }

    if (!chatFunctionUrl) {
      return {
        endpoint: "/api/chat",
        headers: { "Content-Type": "application/json" },
      };
    }

    const tokenRes = await fetch("/api/chat/token", { method: "POST" });
    if (!tokenRes.ok) {
      const data = await tokenRes.json().catch(() => ({}));
      throw new Error(data.error || "Failed to get chat token");
    }
    const { token } = await tokenRes.json();
    return {
      endpoint: chatFunctionUrl,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
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
  ): Promise<void> {
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
          const update = parseSseFrame(frame);
          if (!update) continue;

          if (update.type === "error") {
            throw new Error(update.message || t("error.something_went_wrong"));
          }

          if (update.type === "meta") {
            handleNewSession(update.sessionId, userText);
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
  };
}
