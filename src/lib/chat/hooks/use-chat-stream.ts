"use client";

import { useState, useRef, useCallback, useEffect } from "react";
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
import { fetchChatSessionSnapshot } from "@/lib/chat/hooks/use-chat-persistence";

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
  /** Session selected by the URL. This remains authoritative over local state. */
  controlledSessionId?: string;
  /** Existing route sessions cannot send until their durable state is restored. */
  sessionReady: boolean;
  onSessionCreated?: (sessionId: string, title: string) => void;
  /** called when a stream completes — useful for refreshing session list order */
  onStreamComplete?: (sessionId: string | null) => void;
  /** Re-run route restoration after a terminal transport failure. */
  onTerminalFailure?: (sessionId: string) => void;
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

interface ChatOperation {
  id: number;
  routeSessionId: string | null;
  createdSessionId: string | null;
  controller: AbortController;
}

export function isChatOperationCurrent(
  operation: Pick<ChatOperation, "id" | "routeSessionId" | "createdSessionId">,
  activeOperationId: number | null,
  routeSessionId: string | null,
): boolean {
  const ownsCreatedRoute =
    operation.routeSessionId === null &&
    operation.createdSessionId !== null &&
    operation.createdSessionId === routeSessionId;
  return (
    operation.id === activeOperationId &&
    (operation.routeSessionId === routeSessionId || ownsCreatedRoute)
  );
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
    controlledSessionId,
    sessionReady,
    onSessionCreated,
    onStreamComplete,
    onTerminalFailure,
  } = options;

  const [messages, setMessages] = useState<Message[]>([]);
  const messagesRef = useRef<Message[]>(messages);
  messagesRef.current = messages;
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const thinkingStartRef = useRef<number | null>(null);
  // durable background generation being consumed — lets Stop cancel the worker
  const activeGenerationRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const operationIdRef = useRef(0);
  const activeOperationRef = useRef<ChatOperation | null>(null);
  const routeSessionIdRef = useRef<string | null>(controlledSessionId ?? null);
  routeSessionIdRef.current = controlledSessionId ?? null;

  const isCurrent = useCallback((operation: ChatOperation): boolean => {
    return Boolean(
      mountedRef.current &&
        isChatOperationCurrent(
          operation,
          activeOperationRef.current?.id ?? null,
          routeSessionIdRef.current,
        ),
    );
  }, []);

  const beginOperation = useCallback((): ChatOperation => {
    activeOperationRef.current?.controller.abort();
    const operation = {
      id: ++operationIdRef.current,
      routeSessionId: routeSessionIdRef.current,
      createdSessionId: null,
      controller: new AbortController(),
    };
    activeOperationRef.current = operation;
    return operation;
  }, []);

  const detachOperation = useCallback((operation?: ChatOperation): void => {
    const active = activeOperationRef.current;
    if (!active || (operation && active.id !== operation.id)) return;
    active.controller.abort();
    activeOperationRef.current = null;
  }, []);

  const cancel = useCallback(() => {
    const generationId = activeGenerationRef.current;
    if (generationId) {
      // fire-and-forget: the worker watchdog aborts the LLM stream server-side
      activeGenerationRef.current = null;
      void fetch(`/api/chat/generations/${generationId}/cancel`, {
        method: "POST",
      }).catch(() => {});
    }
    detachOperation();
    if (!mountedRef.current) return;
    setLoading(false);
    // trim trailing empty assistant message if nothing was streamed yet
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant" && !last.content.trim() && !last.thinking) {
        return prev.slice(0, -1);
      }
      return prev;
    });
  }, [detachOperation]);

  // stable ref for sessionId so stream handlers see the latest value
  const sessionIdRef = useRef<string | null>(null);
  sessionIdRef.current = sessionId;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      detachOperation();
    };
  }, [detachOperation]);

  useEffect(() => {
    const nextSessionId = controlledSessionId ?? null;
    const activeOperation = activeOperationRef.current;
    const operationOwnsCreatedRoute = Boolean(
      activeOperation &&
        activeOperation.routeSessionId === null &&
        activeOperation.createdSessionId === nextSessionId,
    );
    if (!operationOwnsCreatedRoute) {
      detachOperation();
      activeGenerationRef.current = null;
      setMessages([]);
      setLoading(false);
      setError(null);
    }
    sessionIdRef.current = nextSessionId;
    setSessionId(nextSessionId);
  }, [controlledSessionId, detachOperation]);

  const handleNewSession = useCallback(
    (
      operation: ChatOperation,
      newSessionId: string | undefined,
      userText: string,
    ): void => {
      if (!isCurrent(operation)) return;
      if (newSessionId && newSessionId !== sessionIdRef.current) {
        if (operation.routeSessionId === null) {
          operation.createdSessionId = newSessionId;
        }
        sessionIdRef.current = newSessionId;
        setSessionId(newSessionId);
        onSessionCreated?.(newSessionId, userText.slice(0, 60));
      }
    },
    [isCurrent, onSessionCreated],
  );

  const consumeStream = useCallback(
    (
      operation: ChatOperation,
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
        setMessages: (update) => {
          if (isCurrent(operation)) setMessages(update);
        },
        onSession: (newSessionId, text) =>
          handleNewSession(operation, newSessionId, text),
        onEventId,
        translate: t,
        signal: operation.controller.signal,
        isActive: () => isCurrent(operation),
      }),
    [handleNewSession, isCurrent, t],
  );

  const consumeGeneration = useCallback(
    (
      operation: ChatOperation,
      generationId: string,
      assistantId: string,
      userText: string,
    ) =>
      consumeBackgroundGeneration({
        generationId,
        assistantId,
        userText,
        signal: operation.controller.signal,
        activeGenerationRef,
        consumeStream: (body, targetAssistantId, text, onEventId) =>
          consumeStream(
            operation,
            body,
            targetAssistantId,
            text,
            onEventId,
          ),
      }),
    [consumeStream],
  );

  const reconcileDurableSession = useCallback(
    async (operation: ChatOperation): Promise<void> => {
      const durableSessionId = sessionIdRef.current;
      if (!durableSessionId || !isCurrent(operation)) return;
      try {
        const snapshot = await fetchChatSessionSnapshot(
          durableSessionId,
          operation.controller.signal,
        );
        if (!isCurrent(operation)) return;
        setMessages(snapshot.messages);
        clearDraft(durableSessionId);
      } catch (restoreFailure) {
        if (!operation.controller.signal.aborted) {
          logChatStream("warn", "durable session reconciliation failed", {
            sessionId: durableSessionId,
            error:
              restoreFailure instanceof Error
                ? restoreFailure.message
                : String(restoreFailure),
          });
        }
      }
    },
    [isCurrent],
  );

  const send = useCallback(
    async (text: string, history: { role: string; content: string }[]) => {
      if (
        !text ||
        !sessionReady ||
        loading ||
        activeOperationRef.current
      ) {
        return;
      }

      const operation = beginOperation();
      const requestSessionId =
        operation.routeSessionId ?? sessionIdRef.current;

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
        logChatStream("info", "starting request", {
          endpoint: "/api/chat",
          assistantId,
          hasSessionId: Boolean(requestSessionId),
          noteCount: selectedNotes.length,
          folderCount: selectedFolders.length,
          thinkingMode,
        });

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: operation.controller.signal,
          body: JSON.stringify({
            message: text,
            noteId,
            noteTitle,
            noteIds: selectedNotes.map((n) => n.id),
            folderIds: selectedFolders.map((f) => f.id),
            selectedNotes,
            selectedFolders,
            sessionId: requestSessionId,
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
            handleNewSession(operation, data.sessionId, text);
            await consumeGeneration(
              operation,
              data.generationId,
              assistantId,
              text,
            );
            if (!isCurrent(operation)) return;
            clearDraft(data.sessionId || sessionIdRef.current);
            onStreamComplete?.(sessionIdRef.current);
            return;
          }
          handleNewSession(operation, data.sessionId, text);
          if (!isCurrent(operation)) return;
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
          onStreamComplete?.(sessionIdRef.current);
          return;
        }

        if (!res.body) {
          throw new Error("Missing stream body");
        }

        const { timeBlockChanged } = await consumeStream(
          operation,
          res.body,
          assistantId,
          text,
        );
        if (!isCurrent(operation)) return;
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
        onStreamComplete?.(sessionIdRef.current);
      } catch (err) {
        if (
          !isCurrent(operation) ||
          (err instanceof Error && err.name === "AbortError")
        ) {
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
        await reconcileDurableSession(operation);
        if (!isCurrent(operation)) return;
        const friendlyMessage = toFriendlyChatError(errMsg);
        setError(
          friendlyMessage.includes("temporarily unavailable")
            ? t("error.ai_unavailable")
            : t("error.something_went_wrong"),
        );
        const failedSessionId = sessionIdRef.current;
        if (failedSessionId) {
          if (operation.routeSessionId) {
            onTerminalFailure?.(failedSessionId);
          } else {
            // A failed first reply still created a durable conversation. Move
            // the page onto that route so its restore and retry UI own it.
            onStreamComplete?.(failedSessionId);
          }
        }
      } finally {
        if (isCurrent(operation)) {
          activeOperationRef.current = null;
          setLoading(false);
        }
      }
    },
    [
      beginOperation,
      consumeGeneration,
      consumeStream,
      handleNewSession,
      isCurrent,
      loading,
      noteId,
      noteTitle,
      onStreamComplete,
      onTerminalFailure,
      reconcileDurableSession,
      selectedNotes,
      selectedFolders,
      sessionReady,
      t,
      thinkingMode,
      useRag,
    ],
  );

  const resume = useCallback(
    async (generationId: string) => {
      if (
        !generationId ||
        !sessionReady ||
        loading ||
        activeOperationRef.current
      ) {
        return;
      }
      const operation = beginOperation();
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
      try {
        await consumeGeneration(operation, generationId, assistantId, "");
        if (!isCurrent(operation)) return;
        onStreamComplete?.(sessionIdRef.current);
      } catch (error) {
        if (
          isCurrent(operation) &&
          !(error instanceof Error && error.name === "AbortError")
        ) {
          await reconcileDurableSession(operation);
          if (!isCurrent(operation)) return;
          setError(t("error.something_went_wrong"));
        }
      } finally {
        if (isCurrent(operation)) {
          activeOperationRef.current = null;
          setLoading(false);
        }
      }
    },
    [
      beginOperation,
      consumeGeneration,
      isCurrent,
      loading,
      onStreamComplete,
      reconcileDurableSession,
      sessionReady,
      t,
    ],
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
