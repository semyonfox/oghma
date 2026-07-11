import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimiter";
import { Metrics } from "@/lib/metrics";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import { getLlmModel, getLlmThinkingMode, type LlmThinkingMode } from "@/lib/ai-config";
import logger from "@/lib/logger";
import { streamText, generateText } from "ai";

import {
  runRagPipeline,
  buildSystemPrompt,
  buildPlainSystemPrompt,
  runKeywordFallback,
  type RagResult,
} from "@/lib/chat/rag-pipeline";
import { persistMessage, type ChatMessage } from "@/lib/chat/session";
import type { MessageMetadata, MessagePart } from "@/lib/chat/types";
import { labelForTool } from "@/lib/chat/tool-labels";
import { normalizeScope, buildSessionMemoryPrompt } from "@/lib/chat/normalize-scope";
import { normalizeClientDateTime } from "@/lib/chat/client-date-time";
import {
  buildRetrievalInfo,
  buildFallbackReply,
  type RetrievalInfo,
} from "@/lib/chat/rag-context";
import { buildLlmCall } from "@/lib/chat/build-stream";
import { recordActivationMilestone } from "@/lib/marketing/events";
import {
  TOOL_CALL_LIMIT_USER_MESSAGE,
  appendToolCallLimitMessage,
  isToolCallLimitFinish,
} from "@/lib/chat/tool-budget";
import {
  type SseWriter,
  sendConnected,
  sendMeta,
  sendSearch,
  sendToken,
  sendThinking,
  sendToolCall,
  sendDone,
  sendError,
  buildSearchContext,
} from "@/lib/chat/stream-events";

function resolveChatThinkingMode(
  requestedThinkingMode: unknown,
): LlmThinkingMode {
  if (requestedThinkingMode === "off") return "off";
  if (requestedThinkingMode !== undefined) return "auto";
  return getLlmThinkingMode();
}

// neutral results used when note retrieval (RAG) is turned off for a message
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

export const POST = withErrorHandler(async (request: NextRequest) => {
  const user = await validateSession();
  if (!user) return tracedError("Unauthorized", 401);

  const userId = user.user_id;
  const limited = await checkRateLimit("chat", userId);
  if (limited) return limited;

  const body = await request.json();
  const {
    message,
    noteId,
    noteTitle,
    noteIds = [],
    folderIds = [],
    selectedNotes = [],
    selectedFolders = [],
    sessionId: requestedSessionId,
    history: requestHistory = [],
    stream = false,
    thinkingMode: requestedThinkingMode,
    useRag = true,
    clientDateTime: rawClientDateTime,
  }: {
    message: string;
    noteId?: string;
    noteTitle?: string;
    noteIds?: string[];
    folderIds?: string[];
    selectedNotes?: { id: string; title: string }[];
    selectedFolders?: { id: string; title: string }[];
    sessionId?: string;
    history?: ChatMessage[];
    stream?: boolean;
    thinkingMode?: unknown;
    useRag?: boolean;
    clientDateTime?: unknown;
  } = body;

  const thinkingMode = resolveChatThinkingMode(requestedThinkingMode);
  const clientDateTime = normalizeClientDateTime(rawClientDateTime);

  if (!message?.trim()) return tracedError("message is required", 400);
  if (message.length > 2000)
    return tracedError("message too long (max 2000 characters)", 400);

  const scopeParams = {
    noteId,
    noteTitle,
    noteIds,
    folderIds,
    selectedNotes,
    selectedFolders,
  };

  // ── streaming response ─────────────────────────────────────────────────────
  if (stream) {
    const chatStreamId = crypto.randomUUID();
    const startedAt = Date.now();
    let clientDisconnected = false;
    let streamClosed = false;
    let bytesSent = 0;
    let lastEvent = "init";

    const markClientDisconnected = (reason: unknown) => {
      if (clientDisconnected) return;
      clientDisconnected = true;
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
              const sessionMemoryPrompt = buildSessionMemoryPrompt(
                scope.sessionContext,
              );
              const { uniqueSources, retrieval } = useRag
                ? await buildRetrievalInfo(userId, scope.scopedNoteIds, ragResult)
                : { uniqueSources: [], retrieval: EMPTY_RETRIEVAL };

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
              sendSearch(writer, scope.scopedNoteIds, ragResult.searchResults);
              lastEvent = "search";

              if (!llmAvailable) {
                const fallback = buildFallbackReply(
                  ragResult.searchResults,
                  ragResult.embeddingAvailable,
                );
                sendToken(writer, fallback);
                await persistMessage(
                  scope.sessionId,
                  "assistant",
                  fallback,
                  { sources: uniqueSources },
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

              // stream LLM response, accumulating typed parts as we go.
              // parts mirror what the client builds for live render — text
              // segments interleaved with tool indicators — and persist as
              // jsonb so reload reproduces the same shape.
              const t0 = Date.now();
              let reply = "";
              let thinking = "";
              let thinkingStartedAt: number | null = null;
              let thinkingDuration: number | undefined;
              let finishReason: string | undefined;
              let rawFinishReason: string | undefined;
              let stepCount = 0;
              let toolCallCount = 0;
              let assistantPersisted = false;
              const parts: MessagePart[] = [];
              let pendingText = "";
              const flushText = () => {
                if (pendingText) {
                  parts.push({ type: "text", text: pendingText });
                  pendingText = "";
                }
              };
              const closeThinkingWindow = () => {
                if (thinkingStartedAt && thinkingDuration == null) {
                  thinkingDuration = Math.max(
                    1,
                    Math.round((Date.now() - thinkingStartedAt) / 1000),
                  );
                }
              };
              const buildMetadata = (
                overrides: Partial<MessageMetadata> = {},
              ): MessageMetadata => ({
                ...(thinking && { thinking }),
                ...(thinkingDuration != null && { thinkingDuration }),
                ...(finishReason && { finishReason }),
                ...(rawFinishReason && { rawFinishReason }),
                stepCount,
                toolCallCount,
                ...overrides,
              });
              const persistAssistant = async (
                content: string,
                metadata?: MessageMetadata,
              ) => {
                await persistMessage(scope.sessionId, "assistant", content, {
                  parts,
                  sources: uniqueSources,
                  metadata,
                });
                assistantPersisted = true;
              };
              try {
                const result = streamText({
                  model: model!,
                  ...llmCallOptions,
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
                    lastEvent = "token";
                  } else if (part.type === "tool-call") {
                    toolCallCount += 1;
                    flushText();
                    parts.push({
                      type: "tool",
                      name: part.toolName,
                      label: labelForTool(part.toolName),
                    });
                    sendToolCall(writer, part.toolName);
                    lastEvent = "tool-call";
                  } else if (part.type === "finish-step") {
                    stepCount += 1;
                    finishReason = part.finishReason;
                    rawFinishReason = part.rawFinishReason;
                  } else if (part.type === "finish") {
                    finishReason = part.finishReason;
                    rawFinishReason = part.rawFinishReason;
                  } else if (part.type === "error") {
                    throw part.error instanceof Error
                      ? part.error
                      : new Error(String(part.error));
                  }
                }
              } catch (error) {
                void Metrics.llmError();
                closeThinkingWindow();
                flushText();
                const detail =
                  error instanceof Error ? error.message : String(error);
                const interrupted =
                  "Response interrupted while generating. Partial output was saved.";
                logger.error("LLM stream interrupted", {
                  chatStreamId,
                  error: detail,
                  model: getLlmModel(),
                  thinkingMode,
                  stepCount,
                  toolCallCount,
                  finishReason,
                  rawFinishReason,
                });
                if (
                  !assistantPersisted &&
                  (reply.trim() || thinking.trim() || parts.length > 0)
                ) {
                  parts.push({ type: "error", text: interrupted });
                  await persistAssistant(
                    reply,
                    buildMetadata({
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
              closeThinkingWindow();
              flushText();
              void Metrics.llmLatency(Date.now() - t0);

              if (
                isToolCallLimitFinish(finishReason, stepCount, maxToolSteps)
              ) {
                logger.warn("LLM stream hit tool-call step limit", {
                  model: getLlmModel(),
                  thinkingMode,
                  maxToolSteps,
                  stepCount,
                  toolCallCount,
                });
                const limitNotice = appendToolCallLimitMessage(reply);
                reply = limitNotice.reply;
                pendingText += limitNotice.delta;
                sendToken(writer, limitNotice.delta);
                lastEvent = "token";
                flushText();
                await persistAssistant(
                  reply,
                  buildMetadata({
                    partial: true,
                    error: TOOL_CALL_LIMIT_USER_MESSAGE,
                    toolCallLimitHit: true,
                  }),
                );
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

              if (!reply.trim()) {
                const emptyReply =
                  "I couldn't generate an answer this time. Please try again.";
                logger.error("LLM stream returned empty response", {
                  chatStreamId,
                  model: getLlmModel(),
                  thinkingMode,
                });
                sendToken(writer, emptyReply);
                lastEvent = "token";
                await persistMessage(
                  scope.sessionId,
                  "assistant",
                  emptyReply,
                  {
                    sources: uniqueSources,
                    metadata: buildMetadata(),
                  },
                );
                sendDone(writer);
                lastEvent = "done";
                logger.info("Chat stream completed with empty-response fallback", {
                  chatStreamId,
                  sessionId: scope.sessionId,
                  elapsedMs: Date.now() - startedAt,
                  bytesSent,
                  clientDisconnected,
                });
                writer.close();
                return;
              }

              await persistAssistant(reply, buildMetadata());
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
                replyLength: reply.length,
                thinkingLength: thinking.length,
                stepCount,
                toolCallCount,
                finishReason,
                rawFinishReason,
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
              sendError(writer, "Failed to generate response");
              lastEvent = "error";
              writer.close();
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
  const sessionMemoryPrompt = buildSessionMemoryPrompt(scope.sessionContext);
  const { uniqueSources, retrieval } = useRag
    ? await buildRetrievalInfo(userId, scope.scopedNoteIds, ragResult)
    : { uniqueSources: [], retrieval: EMPTY_RETRIEVAL };

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
    scope.scopedNoteIds,
    ragResult.searchResults,
  );

  if (!model) {
    await canvasMcpClient?.close().catch(() => {});
    const fallback = buildFallbackReply(
      ragResult.searchResults,
      ragResult.embeddingAvailable,
    );
    await persistMessage(scope.sessionId, "assistant", fallback, {
      sources: uniqueSources,
    });
    return NextResponse.json({
      reply: fallback,
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
    const { text: reply, reasoningText, finishReason, rawFinishReason, steps } =
      result;
    void Metrics.llmLatency(Date.now() - t0);
    const stepCount = steps.length;
    const toolCallCount = steps.reduce(
      (sum, step) => sum + step.toolCalls.length,
      0,
    );
    const metadata: MessageMetadata = {
      ...(reasoningText && { thinking: reasoningText }),
      finishReason,
      ...(rawFinishReason && { rawFinishReason }),
      stepCount,
      toolCallCount,
    };

    if (isToolCallLimitFinish(finishReason, stepCount, maxToolSteps)) {
      const limitNotice = appendToolCallLimitMessage(reply);
      await persistMessage(scope.sessionId, "assistant", limitNotice.reply, {
        parts: [
          ...(reply ? [{ type: "text" as const, text: reply }] : []),
          { type: "text" as const, text: limitNotice.delta },
        ],
        sources: uniqueSources,
        metadata: {
          ...metadata,
          partial: true,
          error: TOOL_CALL_LIMIT_USER_MESSAGE,
          toolCallLimitHit: true,
        },
      });
      return NextResponse.json({
        reply: limitNotice.reply,
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

    await persistMessage(scope.sessionId, "assistant", reply, {
      sources: uniqueSources,
      metadata,
    });
    if (uniqueSources.length > 0) {
      void recordActivationMilestone("first_cited_answer", userId, request).catch((eventError) =>
        logger.warn("failed to record first cited answer milestone", { error: eventError.message }),
      );
    }
    return NextResponse.json({
      reply,
      thinking: reasoningText || undefined,
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
    return tracedError("Failed to generate response", 502);
  }
});
