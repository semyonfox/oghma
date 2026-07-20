import {
  streamText,
  type FinishReason,
  type ModelMessage,
} from "ai";
import logger from "@/lib/logger";
import { Metrics } from "@/lib/metrics";
import {
  runRagPipeline,
  buildSystemPrompt,
  buildPlainSystemPrompt,
  runKeywordFallback,
  type RagResult,
} from "@/lib/chat/rag-pipeline";
import {
  persistMessage,
  type ChatSessionContext,
} from "@/lib/chat/session";
import type { MessageMetadata, MessagePart } from "@/lib/chat/types";
import { labelForTool } from "@/lib/chat/tool-labels";
import { noteSearchDetail, toolCallDetail, toolResultDetail } from "@/lib/chat/tool-display";
import { buildSessionMemoryPrompt } from "@/lib/chat/normalize-scope";
import {
  buildRetrievalInfo,
  buildFallbackReply,
  type RetrievalInfo,
} from "@/lib/chat/rag-context";
import { buildLlmCall } from "@/lib/chat/build-stream";
import {
  shouldSynthesizeFinalAnswer,
  streamFinalAnswer,
} from "@/lib/chat/final-answer";
import { recordActivationMilestone } from "@/lib/marketing/events";
import {
  TOOL_CALL_LIMIT_USER_MESSAGE,
  appendToolCallLimitMessage,
  isToolCallLimitFinish,
} from "@/lib/chat/tool-budget";
import {
  sendConnected,
  sendMeta,
  sendSearch,
  sendToken,
  sendThinking,
  sendToolCall,
  sendToolResult,
  sendDone,
  sendError,
  type SseWriter,
} from "@/lib/chat/stream-events";
import {
  appendChatGenerationEvent,
  cancelChatGeneration,
  claimChatGeneration,
  completeChatGeneration,
  failChatGeneration,
  isChatGenerationCancelRequested,
  loadChatGeneration,
  requeueChatGeneration,
  resetChatGenerationEvents,
} from "@/lib/chat/generation-store";
import {
  hasFreshChatPresence,
  resolveAbortReason,
  type AbortReason,
} from "@/lib/chat/presence";
import { toSseEvent } from "@/lib/chat/sse";

const WATCHDOG_INTERVAL_MS = 5_000;

const EMPTY_RAG_RESULT: RagResult = {
  searchResults: [],
  semanticMatches: [],
  embeddingAvailable: false,
  ragFailed: false,
};

const EMPTY_RETRIEVAL: RetrievalInfo = {
  scopeMode: "global",
  availableCount: 0,
  availableFiles: [],
  semanticHits: [],
  usedFiles: [],
};

function redisWriter(generationId: string): SseWriter & { flush(): Promise<void> } {
  const decoder = new TextDecoder();
  let pending = Promise.resolve();
  return {
    enqueue(chunk) {
      const sse = decoder.decode(chunk);
      if (sse.startsWith(":")) return;
      pending = pending.then(() => appendChatGenerationEvent(generationId, sse)).then(() => undefined);
    },
    close() {},
    flush() {
      return pending;
    },
  };
}

export async function processChatGeneration(
  generationId: string,
  attempt = 1,
  maxAttempts = 1,
): Promise<void> {
  const generation = await loadChatGeneration(generationId);
  if (!generation) throw new Error(`Chat generation ${generationId} not found`);
  if (generation.status === "completed" || generation.status === "cancelled") return;
  if (!(await claimChatGeneration(generationId))) return;

  const payload = generation.request_payload;
  const { userId, sessionId, message, useRag, thinkingMode } = payload;
  const scope = payload.scope;
  const writer = redisWriter(generationId);
  const startedAt = Date.now();
  let canvasMcpClient:
    | Awaited<ReturnType<typeof buildLlmCall>>["canvasMcpClient"]
    | undefined;

  // Watchdog: aborts the LLM stream on explicit stop or real disconnect.
  // A user who never had browser presence (pure API usage) is never
  // disconnect-cancelled — only the explicit cancel flag applies to them.
  const abortController = new AbortController();
  let abortReason: AbortReason = null;
  let sawPresence = false;
  let firstAbsentAt: number | null = null;
  let watchdogBusy = false;
  const watchdogTick = async (): Promise<void> => {
    if (watchdogBusy || abortReason) return;
    watchdogBusy = true;
    try {
      const cancelRequested = await isChatGenerationCancelRequested(generationId);
      const present = cancelRequested ? false : await hasFreshChatPresence(userId);
      if (present) {
        sawPresence = true;
        firstAbsentAt = null;
      } else if (firstAbsentAt === null) {
        firstAbsentAt = Date.now();
      }
      const reason = resolveAbortReason({
        cancelRequested,
        present,
        sawPresence,
        firstAbsentAt,
        now: Date.now(),
      });
      if (reason) {
        abortReason = reason;
        abortController.abort();
      }
    } catch {
      // presence/redis hiccups must never abort a generation
    } finally {
      watchdogBusy = false;
    }
  };
  const watchdog = setInterval(() => void watchdogTick(), WATCHDOG_INTERVAL_MS);
  void watchdogTick();

  // Assigned once streamed state exists so the catch path can persist the
  // partial answer; before that a cancel simply finishes with no message.
  let finalizeCancelled: (() => Promise<void>) | null = null;
  let cancelFinalized = false;
  const finishCancelled = async (): Promise<void> => {
    if (cancelFinalized) return;
    cancelFinalized = true;
    if (finalizeCancelled) {
      await finalizeCancelled();
      return;
    }
    sendDone(writer);
    await writer.flush();
    await cancelChatGeneration(generationId);
    logger.info("Background chat generation cancelled", {
      generationId,
      sessionId,
      reason: abortReason ?? "stopped",
      elapsedMs: Date.now() - startedAt,
    });
  };

  try {
    if (await isChatGenerationCancelRequested(generationId)) {
      await finishCancelled();
      return;
    }
    if (attempt > 1) {
      await resetChatGenerationEvents(generationId);
      await appendChatGenerationEvent(generationId, toSseEvent("reset", {}));
    }
    sendConnected(writer);
    const ragResult = useRag
      ? await runRagPipeline(userId, message, scope.scopedNoteIds)
      : EMPTY_RAG_RESULT;
    const fallbackResults =
      useRag && scope.scopedNoteIds && ragResult.searchResults.length === 0
        ? await runKeywordFallback(userId, message, scope.scopedNoteIds)
        : [];
    const systemPrompt = useRag
      ? buildSystemPrompt([...ragResult.searchResults, ...fallbackResults])
      : buildPlainSystemPrompt();
    const sessionContext = scope.sessionContext as ChatSessionContext;
    const { uniqueSources, retrieval } = useRag
      ? await buildRetrievalInfo(userId, scope.scopedNoteIds, ragResult)
      : { uniqueSources: [], retrieval: EMPTY_RETRIEVAL };

    const llm = await buildLlmCall({
      userId,
      sessionId,
      sessionContext,
      scopedNoteIds: scope.scopedNoteIds,
      scopedInputNoteIds: scope.scopedInputNoteIds,
      history: scope.history,
      message,
      systemPrompt,
      sessionMemoryPrompt: buildSessionMemoryPrompt(sessionContext),
      thinkingMode,
      retrievalEnabled: useRag,
      clientDateTime: payload.clientDateTime,
      requestOrigin: payload.requestOrigin,
      referer: payload.referer ?? null,
    });
    canvasMcpClient = llm.canvasMcpClient;

    sendMeta(writer, sessionId, uniqueSources, retrieval, !ragResult.ragFailed, llm.llmAvailable);
    sendSearch(writer, useRag ? message : undefined, scope.scopedNoteIds, ragResult.searchResults);

    if (!llm.model) {
      const fallback = buildFallbackReply(ragResult.searchResults, ragResult.embeddingAvailable);
      sendToken(writer, fallback);
      await persistMessage(sessionId, "assistant", fallback, {
        parts: [
          ...(useRag ? [{ type: "tool" as const, name: "ragSearch", label: "Searched notes", detail: noteSearchDetail(message, ragResult.searchResults.map((result) => ({ title: result.title || "Untitled" }))) }] : []),
          { type: "text", text: fallback },
        ],
        sources: uniqueSources,
      });
      sendDone(writer);
      await writer.flush();
      await completeChatGeneration(generationId);
      return;
    }

    const t0 = Date.now();
    let reply = "";
    let thinking = "";
    let thinkingStartedAt: number | null = null;
    let thinkingDuration: number | undefined;
    let finishReason: FinishReason | undefined;
    let rawFinishReason: string | undefined;
    let stepCount = 0;
    let toolCallCount = 0;
    let responseMessages: ModelMessage[] = [];
    const parts: MessagePart[] = useRag ? [{
      type: "tool",
      name: "ragSearch",
      label: "Searched notes",
      detail: noteSearchDetail(message, ragResult.searchResults.map((result) => ({ title: result.title || "Untitled" }))),
    }] : [];
    let pendingText = "";
    const flushText = () => {
      if (pendingText) {
        parts.push({ type: "text", text: pendingText });
        pendingText = "";
      }
    };
    const closeThinkingWindow = () => {
      if (thinkingStartedAt && thinkingDuration == null) {
        thinkingDuration = Math.max(1, Math.round((Date.now() - thinkingStartedAt) / 1000));
      }
    };
    const metadata = (overrides: Partial<MessageMetadata> = {}): MessageMetadata => ({
      ...(thinking && { thinking }),
      ...(thinkingDuration != null && { thinkingDuration }),
      ...(finishReason && { finishReason }),
      ...(rawFinishReason && { rawFinishReason }),
      stepCount,
      toolCallCount,
      ...overrides,
    });

    finalizeCancelled = async () => {
      closeThinkingWindow();
      flushText();
      if (reply.trim() || parts.length > 0) {
        await persistMessage(sessionId, "assistant", reply, {
          parts,
          sources: uniqueSources,
          metadata: metadata({
            partial: true,
            cancelled: true,
            error:
              abortReason === "disconnected"
                ? "Interrupted — you left the chat"
                : "Stopped",
          }),
        });
      }
      sendDone(writer);
      await writer.flush();
      await cancelChatGeneration(generationId);
      logger.info("Background chat generation cancelled", {
        generationId,
        sessionId,
        reason: abortReason ?? "stopped",
        elapsedMs: Date.now() - startedAt,
        replyLength: reply.length,
      });
    };

    if (abortReason) {
      await finishCancelled();
      return;
    }

    const result = streamText({
      model: llm.model,
      abortSignal: abortController.signal,
      ...llm.llmCallOptions,
    });
    for await (const part of result.fullStream) {
      if (part.type === "reasoning-delta") {
        if (!thinkingStartedAt) thinkingStartedAt = Date.now();
        thinking += part.text;
        sendThinking(writer, part.text);
      } else if (part.type === "text-delta") {
        closeThinkingWindow();
        reply += part.text;
        pendingText += part.text;
        sendToken(writer, part.text);
      } else if (part.type === "tool-call") {
        toolCallCount += 1;
        flushText();
        const detail = toolCallDetail(part.toolName, part.input);
        parts.push({ type: "tool", name: part.toolName, label: labelForTool(part.toolName), callId: part.toolCallId, detail });
        sendToolCall(writer, part.toolName, part.toolCallId, detail);
      } else if (part.type === "tool-result") {
        const detail = toolResultDetail(part.toolName, part.output);
        const stored = parts.find(
          (item) => item.type === "tool" && item.callId === part.toolCallId,
        );
        if (stored?.type === "tool" && detail) stored.detail = detail;
        sendToolResult(writer, part.toolCallId, detail);
      } else if (part.type === "finish-step") {
        stepCount += 1;
        finishReason = part.finishReason;
        rawFinishReason = part.rawFinishReason;
      } else if (part.type === "finish") {
        finishReason = part.finishReason;
        rawFinishReason = part.rawFinishReason;
      } else if (part.type === "abort") {
        break;
      } else if (part.type === "error") {
        throw part.error instanceof Error ? part.error : new Error(String(part.error));
      }
    }
    if (abortReason || abortController.signal.aborted) {
      await finishCancelled();
      return;
    }
    responseMessages = (await result.response).messages;
    closeThinkingWindow();
    flushText();

    if (isToolCallLimitFinish(finishReason, toolCallCount, llm.maxToolSteps)) {
      const notice = appendToolCallLimitMessage(reply);
      reply = notice.reply;
      parts.push({ type: "text", text: notice.delta });
      sendToken(writer, notice.delta);
      await persistMessage(sessionId, "assistant", reply, {
        parts,
        sources: uniqueSources,
        metadata: metadata({ partial: true, error: TOOL_CALL_LIMIT_USER_MESSAGE, toolCallLimitHit: true }),
      });
    } else {
      if (!reply.trim()) {
        if (!shouldSynthesizeFinalAnswer(reply, finishReason)) {
          throw new Error(`Model ended without an answer (${finishReason})`);
        }
        const finalAnswer = await streamFinalAnswer({
          model: llm.model,
          abortSignal: abortController.signal,
          messages: [...llm.llmCallOptions.messages, ...responseMessages],
          maxOutputTokens: llm.llmCallOptions.maxOutputTokens,
          onTextDelta(text) {
            reply += text;
            pendingText += text;
            sendToken(writer, text);
          },
        });
        stepCount += 1;
        finishReason = finalAnswer.finishReason;
        rawFinishReason = finalAnswer.rawFinishReason;
        if (!reply.trim()) throw new Error("Model returned no answer after final synthesis");
        flushText();
      }
      await persistMessage(sessionId, "assistant", reply, {
        parts,
        sources: uniqueSources,
        metadata: metadata(),
      });
    }

    void Metrics.llmLatency(Date.now() - t0);
    if (uniqueSources.length > 0 && !payload.respectPrivacySignal) {
      void recordActivationMilestone("first_cited_answer", userId).catch(() => {});
    }
    sendDone(writer);
    await writer.flush();
    await completeChatGeneration(generationId);
    logger.info("Background chat generation completed", {
      generationId,
      sessionId,
      elapsedMs: Date.now() - startedAt,
      replyLength: reply.length,
    });
  } catch (error) {
    // A watchdog abort surfaces as an AbortError (or an SDK error part) —
    // that's a clean cancel, not a failure: persist the partial, no retry.
    if (abortReason || abortController.signal.aborted) {
      try {
        await finishCancelled();
      } catch (cancelError) {
        logger.error("Failed to finalize cancelled chat generation", {
          generationId,
          sessionId,
          error:
            cancelError instanceof Error
              ? cancelError.message
              : String(cancelError),
        });
        await cancelChatGeneration(generationId).catch(() => {});
      }
      return;
    }
    void Metrics.llmError();
    const detail = error instanceof Error ? error.message : String(error);
    logger.error("Background chat generation failed", { generationId, sessionId, error: detail });
    if (attempt < maxAttempts) {
      await requeueChatGeneration(generationId, detail);
    } else {
      await failChatGeneration(generationId, detail);
      sendError(writer, "Failed to generate response");
      await writer.flush().catch(() => {});
    }
    throw error;
  } finally {
    clearInterval(watchdog);
    await canvasMcpClient?.close().catch(() => {});
  }
}
