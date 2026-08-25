"use client";

import { useState, useRef, useCallback } from "react";
import type { LlmThinkingMode } from "@/lib/ai-config";
import { toFriendlyChatError } from "@/lib/friendly-errors";
import type { Message, ChatContextItem } from "@/lib/chat/types";
import { noteSearchDetail } from "@/lib/chat/tool-display";
import { formatClientDateTime } from "@/lib/chat/client-date-time";
import {
  consumeBackgroundGeneration,
  consumeChatStream,
  logChatStream,
  resolveResumeAssistantId,
} from "@/lib/chat/client-stream";

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
  /** whether to retrieve note context (RAG). Off = plain chat, saves tokens. */
  useRag: boolean;
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
  resume: (generationId: string) => Promise<void>;
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
    useRag,
    onSessionCreated,
    onStreamComplete,
  } = options;

  const [messages, setMessages] = useState<Message[]>([]);
  const messagesRef = useRef<Message[]>(messages);
  messagesRef.current = messages;
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const thinkingStartRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // durable background generation being consumed — lets Stop cancel the worker
  const activeGenerationRef = useRef<string | null>(null);

  const cancel = useCallback(() => {
    const generationId = activeGenerationRef.current;
    if (generationId) {
      // fire-and-forget: the worker watchdog aborts the LLM stream server-side
      activeGenerationRef.current = null;
      void fetch(`/api/chat/generations/${generationId}/cancel`, {
        method: "POST",
      }).catch(() => {});
    }
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

  const handleNewSession = useCallback(
    (newSessionId: string | undefined, userText: string): void => {
      if (newSessionId && newSessionId !== sessionIdRef.current) {
        setSessionId(newSessionId);
        onSessionCreated?.(newSessionId, userText.slice(0, 60));
      }
    },
    [onSessionCreated],
  );

  const consumeStream = useCallback(
    (
      body: ReadableStream<Uint8Array>,
      assistantId: string,
      userText: string,
      onEventId?: (id: string) => void,
    ) =>
      consumeChatStream({
        body,
        assistantId,
        userText,
        thinkingStartRef,
        setMessages,
        onSession: handleNewSession,
        onEventId,
        translate: t,
      }),
    [handleNewSession, t],
  );

  const consumeGeneration = useCallback(
    (
      generationId: string,
      assistantId: string,
      userText: string,
      signal: AbortSignal,
    ) =>
      consumeBackgroundGeneration({
        generationId,
        assistantId,
        userText,
        signal,
        activeGenerationRef,
        consumeStream,
      }),
    [consumeStream],
  );

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
        const controller = new AbortController();
        abortControllerRef.current = controller;
        logChatStream("info", "starting request", {
          endpoint: "/api/chat",
          assistantId,
          hasSessionId: Boolean(sessionId),
          noteCount: selectedNotes.length,
          folderCount: selectedFolders.length,
          thinkingMode,
        });

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
            background: true,
            thinkingMode,
            useRag,
            clientDateTime: formatClientDateTime(),
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
          if (typeof data.generationId === "string") {
            handleNewSession(data.sessionId, text);
            await consumeGeneration(
              data.generationId,
              assistantId,
              text,
              controller.signal,
            );
            clearDraft(data.sessionId || sessionIdRef.current);
            onStreamComplete?.();
            return;
          }
          handleNewSession(data.sessionId, text);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: data.reply || "",
                    parts: [
                      ...(data.searchContext?.query ? [{
                        type: "tool" as const,
                        name: "ragSearch",
                        label: "Searched notes",
                        detail: noteSearchDetail(data.searchContext.query, data.searchContext.results ?? []),
                      }] : []),
                      ...(data.reply ? [{ type: "text" as const, text: data.reply }] : []),
                    ],
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
    [
      consumeGeneration,
      consumeStream,
      handleNewSession,
      loading,
      noteId,
      noteTitle,
      onStreamComplete,
      selectedNotes,
      selectedFolders,
      sessionId,
      t,
      thinkingMode,
      useRag,
    ],
  );

  const resume = useCallback(
    async (generationId: string) => {
      if (!generationId || loading) return;
      const proposedAssistantId = makeId();
      const assistantId = resolveResumeAssistantId(
        messagesRef.current,
        proposedAssistantId,
      );
      if (assistantId === proposedAssistantId) {
        setMessages((prev) => [
          ...prev,
          {
            id: assistantId,
            role: "assistant",
            content: "",
            parts: [],
            sources: [],
            timestamp: Date.now(),
          },
        ]);
      }
      setLoading(true);
      const controller = new AbortController();
      abortControllerRef.current = controller;
      try {
        await consumeGeneration(generationId, assistantId, "", controller.signal);
        onStreamComplete?.();
      } catch (error) {
        if (!(error instanceof Error && error.name === "AbortError")) {
          setError(t("error.something_went_wrong"));
        }
      } finally {
        abortControllerRef.current = null;
        setLoading(false);
      }
    },
    [consumeGeneration, loading, onStreamComplete, t],
  );

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
    resume,
  };
}
