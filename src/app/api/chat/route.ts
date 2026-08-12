import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rateLimiter";
import { Metrics } from "@/lib/metrics";
import {
  parseJsonObject,
  requireAuth,
  tracedError,
  withErrorHandler,
} from "@/lib/api-error";
import { chatRequestSchema, validateBody } from "@/lib/validations/schemas";
import { getLlmModel, getLlmThinkingMode, type LlmThinkingMode } from "@/lib/ai-config";
import logger from "@/lib/logger";
import { streamText, generateText, type ModelMessage } from "ai";

import {
  markChatGenerationFailed,
  persistMessage,
} from "@/lib/chat/session";
import type { MessageMetadata } from "@/lib/chat/types";
import { normalizeScope } from "@/lib/chat/normalize-scope";
import { normalizeClientDateTime } from "@/lib/chat/client-date-time";
import { buildLlmCall } from "@/lib/chat/build-stream";
import { prepareChatGeneration } from "@/lib/chat/prepare-generation";
import { streamFinalAnswer } from "@/lib/chat/final-answer";
import { recordActivationMilestone } from "@/lib/marketing/events";
import { TOOL_CALL_LIMIT_USER_MESSAGE } from "@/lib/chat/tool-budget";
import {
  appendChatGenerationText,
  applyChatGenerationEvent,
  buildChatGenerationFromSteps,
  buildChatGenerationMetadata,
  closeChatThinkingWindow,
  createChatGenerationResult,
  finalizeChatGenerationResult,
  finishChatGenerationStep,
  flushChatGenerationText,
} from "@/lib/chat/generation-result";
import {
  type SseWriter,
  sendConnected,
  sendMeta,
  sendSearch,
  sendToken,
  sendThinking,
  sendToolCall,
  sendToolResult,
  sendDone,
  sendError,
  sendHeartbeat,
  buildSearchContext,
} from "@/lib/chat/stream-events";
import {
  createChatGeneration,
  failChatGeneration,
} from "@/lib/chat/generation-store";
import { enqueueChatGeneration } from "@/lib/queue";
import { hasPrivacySignal } from "@/lib/marketing/events";

function resolveChatThinkingMode(
  requestedThinkingMode: unknown,
): LlmThinkingMode {
  if (requestedThinkingMode === "off") return "off";
  if (requestedThinkingMode !== undefined) return "auto";
  return getLlmThinkingMode();
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  const user = await requireAuth();
  const userId = user.user_id;
  const limited = await checkRateLimit("chat", userId);
  if (limited) return limited;

  const validation = validateBody(chatRequestSchema, await parseJsonObject(request));
  if (!validation.success) return validation.response;
  const body = validation.data;
  const {
    message,
    noteId,
    noteTitle,
    noteIds = [],
    folderIds = [],
    selectedNotes = [],
    selectedFolders = [],
    sessionId,
    history: requestHistory = [],
    stream = false,
    background = false,
    thinkingMode: requestedThinkingMode,
    useRag = true,
    clientDateTime: rawClientDateTime,
  } = body;
  const requestedSessionId = sessionId ?? undefined;

  const thinkingMode = resolveChatThinkingMode(requestedThinkingMode);
  const clientDateTime = normalizeClientDateTime(rawClientDateTime);

  const scopeParams = {
    noteId,
    noteTitle,
    noteIds,
    folderIds,
    selectedNotes,
    selectedFolders,
  };

  if (stream && background) {
    const scope = await normalizeScope(
      userId,
      scopeParams,
      body,
      requestedSessionId,
      message,
      requestHistory,
    );
    const generationId = await createChatGeneration({
      userId,
      sessionId: scope.sessionId,
      message,
      scope: {
        sessionContext: scope.sessionContext,
        scopedNoteIds: scope.scopedNoteIds,
        scopedInputNoteIds: scope.scopedInputNoteIds,
        history: scope.history,
      },
      useRag,
      thinkingMode,
      clientDateTime,
      requestOrigin: request.nextUrl.origin,
      referer: request.headers.get("referer") ?? undefined,
      respectPrivacySignal: hasPrivacySignal(request),
    });
    try {
      await enqueueChatGeneration(generationId);
    } catch (error) {
      await failChatGeneration(
        generationId,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
    return NextResponse.json(
      { generationId, sessionId: scope.sessionId },
      { status: 202 },
    );
  }

  // ── streaming response ─────────────────────────────────────────────────────
  if (stream) {
    const chatStreamId = crypto.randomUUID();
    const startedAt = Date.now();
    let clientDisconnected = false;
    let streamClosed = false;
    let bytesSent = 0;
    let lastEvent = "init";
    let activeSessionId: string | null = null;

    // Aborts the in-flight LLM stream when the client goes away, so a dropped
    // inline connection stops billing instead of generating into the void.
    const inlineAbort = new AbortController();

    const markClientDisconnected = (reason: unknown) => {
      if (clientDisconnected) return;
      clientDisconnected = true;
      inlineAbort.abort();
      logger.warn("Chat stream client disconnected", {
        chatStreamId,
        elapsedMs: Date.now() - startedAt,
        bytesSent,
        lastEvent,
        reason:
          reason instanceof Error
            ? reason.message
            : typeof reason === "string"
              ? reason
              : String(reason ?? "unknown"),
      });
    };
    request.signal.addEventListener("abort", () =>
      markClientDisconnected("request aborted"),
    );

    return new NextResponse(
      new ReadableStream({
        start(controller) {
          void (async () => {
            const writer: SseWriter = {
              enqueue(chunk) {
                if (clientDisconnected || streamClosed) return;
                try {
                  controller.enqueue(chunk);
                  bytesSent += chunk.byteLength;
                } catch (error) {
                  markClientDisconnected(error);
                }
              },
              close() {
                if (streamClosed) return;
                streamClosed = true;
                if (clientDisconnected) return;
                try {
                  controller.close();
                } catch (error) {
                  markClientDisconnected(error);
                }
              },
            };
            const heartbeatId = setInterval(() => {
              if (!streamClosed && !clientDisconnected) sendHeartbeat(writer);
            }, 15_000);
            try {
              logger.info("Chat stream started", {
                chatStreamId,
                userId,
                requestedSession: Boolean(requestedSessionId),
                scopedNoteCount: noteIds.length + (noteId ? 1 : 0),
                scopedFolderCount: folderIds.length,
                thinkingMode,
              });
              sendConnected(writer);
              lastEvent = "connected";

              const scope = await normalizeScope(
                userId,
                scopeParams,
                body,
                requestedSessionId,
                message,
                requestHistory,
              );
              activeSessionId = scope.sessionId;

              const prepared = await prepareChatGeneration({
                userId,
                message,
                useRag,
                scopedNoteIds: scope.scopedNoteIds,
                sessionContext: scope.sessionContext,
              });
              const {
                ragResult,
                systemPrompt,
                sessionMemoryPrompt,
                uniqueSources,
                retrieval,
                initialParts,
                fallbackReply,
              } = prepared;

              const {
                model,
                llmAvailable,
                llmCallOptions,
                canvasMcpClient,
                maxToolSteps,
              } = await buildLlmCall({
                userId,
                sessionId: scope.sessionId,
                sessionContext: scope.sessionContext,
                scopedNoteIds: scope.scopedNoteIds,
                scopedInputNoteIds: scope.scopedInputNoteIds,
                history: scope.history,
                message,
                systemPrompt,
                sessionMemoryPrompt,
                thinkingMode,
                retrievalEnabled: useRag,
                clientDateTime,
                requestOrigin: request.nextUrl.origin,
                referer: request.headers.get("referer"),
              });

              sendMeta(
                writer,
                scope.sessionId,
                uniqueSources,
                retrieval,
                !ragResult.ragFailed,
                llmAvailable,
              );
              lastEvent = "meta";
              sendSearch(writer, useRag ? message : undefined, scope.scopedNoteIds, ragResult.searchResults);
              lastEvent = "search";

              if (!llmAvailable) {
                sendToken(writer, fallbackReply);
                await persistMessage(
                  scope.sessionId,
                  "assistant",
                  fallbackReply,
                  {
                    parts: [
                      ...initialParts,
                      { type: "text", text: fallbackReply },
                    ],
                    sources: uniqueSources,
                  },
                );
                sendDone(writer);
                lastEvent = "done";
                logger.info("Chat stream completed with fallback response", {
                  chatStreamId,
                  sessionId: scope.sessionId,
                  elapsedMs: Date.now() - startedAt,
                  bytesSent,
                  clientDisconnected,
                });
                writer.close();
                return;
              }

              const t0 = Date.now();
              let generation = createChatGenerationResult(initialParts);
              let assistantPersisted = false;
              let responseMessages: ModelMessage[] = [];
              const persistAssistant = async (
                content: string,
                metadata?: MessageMetadata,
              ) => {
                await persistMessage(scope.sessionId, "assistant", content, {
                  parts: generation.parts,
                  sources: uniqueSources,
                  metadata,
                });
                assistantPersisted = true;
              };
              try {
                const result = streamText({
                  model: model!,
                  abortSignal: inlineAbort.signal,
                  ...llmCallOptions,
                });
                for await (const part of result.fullStream) {
                  const update = applyChatGenerationEvent(generation, part);
                  generation = update.result;
                  if (update.effect.type === "thinking") {
                    sendThinking(writer, update.effect.text);
                  } else if (update.effect.type === "text") {
                    sendToken(writer, update.effect.text);
                    lastEvent = "token";
                  } else if (update.effect.type === "tool-call") {
                    sendToolCall(
                      writer,
                      update.effect.toolName,
                      update.effect.toolCallId,
                      update.effect.detail,
                    );
                    lastEvent = "tool-call";
                  } else if (update.effect.type === "tool-result") {
                    sendToolResult(
                      writer,
                      update.effect.toolCallId,
                      update.effect.detail,
                    );
                  } else if (update.effect.type === "abort") {
                    throw new Error("Generation aborted: client disconnected");
                  } else if (update.effect.type === "error") {
                    throw update.effect.error instanceof Error
                      ? update.effect.error
                      : new Error(String(update.effect.error));
                  }
                }
                responseMessages = (await result.response).messages;
              } catch (error) {
                void Metrics.llmError();
                generation = flushChatGenerationText(
                  closeChatThinkingWindow(generation),
                );
                const detail =
                  error instanceof Error ? error.message : String(error);
                const interrupted =
                  "Response interrupted while generating. Partial output was saved.";
                logger.error("LLM stream interrupted", {
                  chatStreamId,
                  error: detail,
                  model: getLlmModel(),
                  thinkingMode,
                  stepCount: generation.stepCount,
                  toolCallCount: generation.toolCallCount,
                  finishReason: generation.finishReason,
                  rawFinishReason: generation.rawFinishReason,
                });
                if (
                  !assistantPersisted &&
                  (generation.reply.trim() ||
                    generation.thinking.trim() ||
                    generation.parts.length > 0)
                ) {
                  generation = {
                    ...generation,
                    parts: [
                      ...generation.parts,
                      { type: "error", text: interrupted },
                    ],
                  };
                  await persistAssistant(
                    generation.reply,
                    buildChatGenerationMetadata(generation, {
                      partial: true,
                      error: detail,
                    }),
                  ).catch((persistError) => {
                    logger.error("Failed to persist interrupted LLM stream", {
                      error:
                        persistError instanceof Error
                          ? persistError.message
                          : String(persistError),
                    });
                  });
                }
                sendError(writer, interrupted);
                lastEvent = "error";
                writer.close();
                return;
              } finally {
                await canvasMcpClient?.close().catch(() => {});
              }

              let finalization = finalizeChatGenerationResult(
                generation,
                maxToolSteps,
              );
              generation = finalization.result;
              if (finalization.kind === "tool-call-limit") {
                logger.warn("LLM stream hit tool-call limit", {
                  model: getLlmModel(),
                  thinkingMode,
                  maxToolSteps,
                  stepCount: generation.stepCount,
                  toolCallCount: generation.toolCallCount,
                });
                sendToken(writer, finalization.delta);
                lastEvent = "token";
                await persistAssistant(
                  generation.reply,
                  buildChatGenerationMetadata(generation, {
                    partial: true,
                    error: TOOL_CALL_LIMIT_USER_MESSAGE,
                    toolCallLimitHit: true,
                  }),
                );
                void Metrics.llmLatency(Date.now() - t0);
                sendDone(writer);
                lastEvent = "done";
                logger.warn("Chat stream completed after tool-call limit", {
                  chatStreamId,
                  sessionId: scope.sessionId,
                  elapsedMs: Date.now() - startedAt,
                  bytesSent,
                  clientDisconnected,
                });
                writer.close();
                return;
              }

              if (finalization.kind === "invalid") {
                throw new Error(finalization.error);
              }
              if (finalization.kind === "synthesize-final-answer") {
                logger.warn("LLM stream returned reasoning without an answer", {
                  chatStreamId,
                  model: getLlmModel(),
                  thinkingMode,
                  stepCount: generation.stepCount,
                  toolCallCount: generation.toolCallCount,
                });
                const finalAnswer = await streamFinalAnswer({
                  model: model!,
                  abortSignal: inlineAbort.signal,
                  messages: [
                    ...llmCallOptions.messages,
                    ...responseMessages,
                  ],
                  maxOutputTokens: llmCallOptions.maxOutputTokens,
                  onTextDelta(text) {
                    generation = appendChatGenerationText(generation, text);
                    sendToken(writer, text);
                    lastEvent = "token";
                  },
                });
                generation = finishChatGenerationStep(
                  generation,
                  finalAnswer.finishReason,
                  finalAnswer.rawFinishReason,
                );
                finalization = finalizeChatGenerationResult(
                  generation,
                  maxToolSteps,
                );
                generation = finalization.result;
                if (finalization.kind !== "complete") {
                  throw new Error(
                    "Model returned no answer after final synthesis",
                  );
                }
                logger.info("Recovered reasoning-only LLM response", {
                  chatStreamId,
                  model: getLlmModel(),
                  finishReason: generation.finishReason,
                  rawFinishReason: generation.rawFinishReason,
                  replyLength: generation.reply.length,
                });
              }

              void Metrics.llmLatency(Date.now() - t0);
              await persistAssistant(
                generation.reply,
                buildChatGenerationMetadata(generation),
              );
              if (uniqueSources.length > 0) {
                void recordActivationMilestone("first_cited_answer", userId, request).catch((eventError) =>
                  logger.warn("failed to record first cited answer milestone", { error: eventError.message }),
                );
              }
              sendDone(writer);
              lastEvent = "done";
              logger.info("Chat stream completed", {
                chatStreamId,
                sessionId: scope.sessionId,
                elapsedMs: Date.now() - startedAt,
                bytesSent,
                clientDisconnected,
                replyLength: generation.reply.length,
                thinkingLength: generation.thinking.length,
                stepCount: generation.stepCount,
                toolCallCount: generation.toolCallCount,
                finishReason: generation.finishReason,
                rawFinishReason: generation.rawFinishReason,
              });
              writer.close();
            } catch (error) {
              void Metrics.llmError();
              const detail =
                error instanceof Error ? error.message : String(error);
              logger.error("LLM stream failed", {
                chatStreamId,
                error: detail,
                model: getLlmModel(),
                thinkingMode,
                elapsedMs: Date.now() - startedAt,
                bytesSent,
                clientDisconnected,
                lastEvent,
              });
              if (activeSessionId) {
                await markChatGenerationFailed(activeSessionId).catch(
                  (statusError) =>
                    logger.error("Failed to mark chat generation as failed", {
                      chatStreamId,
                      error:
                        statusError instanceof Error
                          ? statusError.message
                          : String(statusError),
                    }),
                );
              }
              sendError(writer, "Failed to generate response");
              lastEvent = "error";
              writer.close();
            } finally {
              clearInterval(heartbeatId);
            }
          })();
        },
        cancel(reason) {
          markClientDisconnected(reason);
        },
      }),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      },
    );
  }

  // ── non-streaming response ─────────────────────────────────────────────────

  const scope = await normalizeScope(
    userId,
    scopeParams,
    body,
    requestedSessionId,
    message,
    requestHistory,
  );

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
    sessionContext: scope.sessionContext,
  });

  const { model, llmCallOptions, canvasMcpClient, maxToolSteps } =
    await buildLlmCall({
      userId,
      sessionId: scope.sessionId,
      sessionContext: scope.sessionContext,
      scopedNoteIds: scope.scopedNoteIds,
      scopedInputNoteIds: scope.scopedInputNoteIds,
      history: scope.history,
      message,
      systemPrompt,
      sessionMemoryPrompt,
      thinkingMode,
      retrievalEnabled: useRag,
      clientDateTime,
      requestOrigin: request.nextUrl.origin,
      referer: request.headers.get("referer"),
    });

  const searchContext = buildSearchContext(
    useRag ? message : undefined,
    scope.scopedNoteIds,
    ragResult.searchResults,
  );

  if (!model) {
    await canvasMcpClient?.close().catch(() => {});
    await persistMessage(scope.sessionId, "assistant", fallbackReply, {
      parts: [...initialParts, { type: "text", text: fallbackReply }],
      sources: uniqueSources,
    });
    return NextResponse.json({
      reply: fallbackReply,
      sources: uniqueSources,
      retrieval,
      llmAvailable: false,
      sessionId: scope.sessionId,
      searchContext,
    });
  }

  try {
    const t0 = Date.now();
    const result = await (async () => {
      try {
        return await generateText({ model, ...llmCallOptions });
      } finally {
        await canvasMcpClient?.close().catch(() => {});
      }
    })();
    let generation = buildChatGenerationFromSteps(
      initialParts,
      result.steps,
    );
    let finalization = finalizeChatGenerationResult(
      generation,
      maxToolSteps,
    );

    if (finalization.kind === "synthesize-final-answer") {
      const finalAnswer = await streamFinalAnswer({
        model,
        messages: [...llmCallOptions.messages, ...result.response.messages],
        maxOutputTokens: llmCallOptions.maxOutputTokens,
        onTextDelta(text) {
          generation = appendChatGenerationText(generation, text);
        },
      });
      generation = finishChatGenerationStep(
        generation,
        finalAnswer.finishReason,
        finalAnswer.rawFinishReason,
      );
      finalization = finalizeChatGenerationResult(generation, maxToolSteps);
      if (finalization.kind !== "complete") {
        throw new Error("Model returned no answer after final synthesis");
      }
    }

    generation = finalization.result;
    void Metrics.llmLatency(Date.now() - t0);

    if (finalization.kind === "invalid") {
      throw new Error(finalization.error);
    }
    if (finalization.kind === "tool-call-limit") {
      await persistMessage(scope.sessionId, "assistant", generation.reply, {
        parts: generation.parts,
        sources: uniqueSources,
        metadata: buildChatGenerationMetadata(generation, {
          partial: true,
          error: TOOL_CALL_LIMIT_USER_MESSAGE,
          toolCallLimitHit: true,
        }),
      });
      return NextResponse.json({
        reply: generation.reply,
        sources: uniqueSources,
        retrieval,
        llmAvailable: true,
        ragAvailable: !ragResult.ragFailed,
        sessionId: scope.sessionId,
        searchContext,
        partial: true,
        error: TOOL_CALL_LIMIT_USER_MESSAGE,
        toolCallLimitHit: true,
      });
    }

    await persistMessage(scope.sessionId, "assistant", generation.reply, {
      parts: generation.parts,
      sources: uniqueSources,
      metadata: buildChatGenerationMetadata(generation),
    });
    if (uniqueSources.length > 0) {
      void recordActivationMilestone("first_cited_answer", userId, request).catch((eventError) =>
        logger.warn("failed to record first cited answer milestone", { error: eventError.message }),
      );
    }
    return NextResponse.json({
      reply: generation.reply,
      thinking: generation.thinking || undefined,
      sources: uniqueSources,
      retrieval,
      llmAvailable: true,
      ragAvailable: !ragResult.ragFailed,
      sessionId: scope.sessionId,
      searchContext,
    });
  } catch (error) {
    void Metrics.llmError();
    const detail = error instanceof Error ? error.message : String(error);
    logger.error("LLM call failed", {
      error: detail,
      model: getLlmModel(),
      thinkingMode,
    });
    await markChatGenerationFailed(scope.sessionId).catch((statusError) =>
      logger.error("Failed to mark chat generation as failed", {
        error:
          statusError instanceof Error
            ? statusError.message
            : String(statusError),
      }),
    );
    return tracedError("Failed to generate response", 502);
  }
});
