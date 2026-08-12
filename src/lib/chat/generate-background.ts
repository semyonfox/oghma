import { streamText, type ModelMessage } from "ai";
import logger from "@/lib/logger";
import { Metrics } from "@/lib/metrics";
import {
  persistMessage,
} from "@/lib/chat/session";
import { buildLlmCall } from "@/lib/chat/build-stream";
import { prepareChatGeneration } from "@/lib/chat/prepare-generation";
import { streamFinalAnswer } from "@/lib/chat/final-answer";
import { recordActivationMilestone } from "@/lib/marketing/events";
import { TOOL_CALL_LIMIT_USER_MESSAGE } from "@/lib/chat/tool-budget";
import {
  appendChatGenerationText,
  applyChatGenerationEvent,
  buildChatGenerationMetadata,
  closeChatThinkingWindow,
  createChatGenerationResult,
  finalizeChatGenerationResult,
  finishChatGenerationStep,
  flushChatGenerationText,
} from "@/lib/chat/generation-result";
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
    const sessionContext = scope.sessionContext;
    const {
      ragResult,
      systemPrompt,
      sessionMemoryPrompt,
      uniqueSources,
      retrieval,
      initialParts,
      fallbackReply,
    } = await prepareChatGeneration({
      userId,
      message,
      useRag,
      scopedNoteIds: scope.scopedNoteIds,
      sessionContext,
    });

    const llm = await buildLlmCall({
      userId,
      sessionId,
      sessionContext,
      scopedNoteIds: scope.scopedNoteIds,
      scopedInputNoteIds: scope.scopedInputNoteIds,
      history: scope.history,
      message,
      systemPrompt,
      sessionMemoryPrompt,
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
      sendToken(writer, fallbackReply);
      await persistMessage(sessionId, "assistant", fallbackReply, {
        parts: [...initialParts, { type: "text", text: fallbackReply }],
        sources: uniqueSources,
      });
      sendDone(writer);
      await writer.flush();
      await completeChatGeneration(generationId);
      return;
    }

    const t0 = Date.now();
    let generation = createChatGenerationResult(initialParts);
    let responseMessages: ModelMessage[] = [];

    finalizeCancelled = async () => {
      generation = flushChatGenerationText(
        closeChatThinkingWindow(generation),
      );
      if (generation.reply.trim() || generation.parts.length > 0) {
        await persistMessage(sessionId, "assistant", generation.reply, {
          parts: generation.parts,
          sources: uniqueSources,
          metadata: buildChatGenerationMetadata(generation, {
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
        replyLength: generation.reply.length,
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
      const update = applyChatGenerationEvent(generation, part);
      generation = update.result;
      if (update.effect.type === "thinking") {
        sendThinking(writer, update.effect.text);
      } else if (update.effect.type === "text") {
        sendToken(writer, update.effect.text);
      } else if (update.effect.type === "tool-call") {
        sendToolCall(
          writer,
          update.effect.toolName,
          update.effect.toolCallId,
          update.effect.detail,
        );
      } else if (update.effect.type === "tool-result") {
        sendToolResult(
          writer,
          update.effect.toolCallId,
          update.effect.detail,
        );
      } else if (update.effect.type === "abort") {
        break;
      } else if (update.effect.type === "error") {
        throw update.effect.error instanceof Error
          ? update.effect.error
          : new Error(String(update.effect.error));
      }
    }
    if (abortReason || abortController.signal.aborted) {
      await finishCancelled();
      return;
    }
    responseMessages = (await result.response).messages;
    let finalization = finalizeChatGenerationResult(
      generation,
      llm.maxToolSteps,
    );
    generation = finalization.result;

    if (finalization.kind === "tool-call-limit") {
      sendToken(writer, finalization.delta);
      await persistMessage(sessionId, "assistant", generation.reply, {
        parts: generation.parts,
        sources: uniqueSources,
        metadata: buildChatGenerationMetadata(generation, {
          partial: true,
          error: TOOL_CALL_LIMIT_USER_MESSAGE,
          toolCallLimitHit: true,
        }),
      });
    } else {
      if (finalization.kind === "invalid") {
        throw new Error(finalization.error);
      }
      if (finalization.kind === "synthesize-final-answer") {
        const finalAnswer = await streamFinalAnswer({
          model: llm.model,
          abortSignal: abortController.signal,
          messages: [...llm.llmCallOptions.messages, ...responseMessages],
          maxOutputTokens: llm.llmCallOptions.maxOutputTokens,
          onTextDelta(text) {
            generation = appendChatGenerationText(generation, text);
            sendToken(writer, text);
          },
        });
        generation = finishChatGenerationStep(
          generation,
          finalAnswer.finishReason,
          finalAnswer.rawFinishReason,
        );
        finalization = finalizeChatGenerationResult(
          generation,
          llm.maxToolSteps,
        );
        generation = finalization.result;
        if (finalization.kind !== "complete") {
          throw new Error("Model returned no answer after final synthesis");
        }
      }
      await persistMessage(sessionId, "assistant", generation.reply, {
        parts: generation.parts,
        sources: uniqueSources,
        metadata: buildChatGenerationMetadata(generation),
      });
    }

    void Metrics.llmLatency(Date.now() - t0);
    if (
      finalization.kind === "complete" &&
      uniqueSources.length > 0 &&
      !payload.respectPrivacySignal
    ) {
      void recordActivationMilestone("first_cited_answer", userId).catch(() => {});
    }
    sendDone(writer);
    await writer.flush();
    await completeChatGeneration(generationId);
    logger.info("Background chat generation completed", {
      generationId,
      sessionId,
      elapsedMs: Date.now() - startedAt,
      replyLength: generation.reply.length,
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
