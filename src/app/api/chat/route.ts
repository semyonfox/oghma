import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimiter";
import { Metrics } from "@/lib/metrics";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import { getLlmModel, getLlmThinkingMode, type LlmThinkingMode } from "@/lib/ai-config";
import logger from "@/lib/logger";
import { streamText, generateText } from "ai";

import { runRagPipeline, buildSystemPrompt, runKeywordFallback } from "@/lib/chat/rag-pipeline";
import { persistMessage, type ChatMessage } from "@/lib/chat/session";
import type { MessageMetadata, MessagePart } from "@/lib/chat/types";
import { labelForTool } from "@/lib/chat/tool-labels";
import { normalizeScope, buildSessionMemoryPrompt } from "@/lib/chat/normalize-scope";
import { buildRetrievalInfo, buildFallbackReply } from "@/lib/chat/rag-context";
import { buildLlmCall } from "@/lib/chat/build-stream";
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
  } = body;

  const thinkingMode = resolveChatThinkingMode(requestedThinkingMode);

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
    return new NextResponse(
      new ReadableStream({
        start(controller) {
          void (async () => {
            const writer: SseWriter = controller;
            try {
              sendConnected(writer);

              const scope = await normalizeScope(
                userId,
                scopeParams,
                body,
                requestedSessionId,
                message,
                requestHistory,
              );

              const ragResult = await runRagPipeline(
                userId,
                message,
                scope.scopedNoteIds,
              );

              const fallbackResults = scope.scopedNoteIds && ragResult.searchResults.length === 0
                ? await runKeywordFallback(userId, message, scope.scopedNoteIds)
                : [];
              const systemPrompt = buildSystemPrompt([...ragResult.searchResults, ...fallbackResults]);
              const sessionMemoryPrompt = buildSessionMemoryPrompt(
                scope.sessionContext,
              );
              const { uniqueSources, retrieval } = await buildRetrievalInfo(
                userId,
                scope.scopedNoteIds,
                ragResult,
              );

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
              sendSearch(writer, scope.scopedNoteIds, ragResult.searchResults);

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
                  } else if (part.type === "tool-call") {
                    toolCallCount += 1;
                    flushText();
                    parts.push({
                      type: "tool",
                      name: part.toolName,
                      label: labelForTool(part.toolName),
                    });
                    sendToolCall(writer, part.toolName);
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
                writer.close();
                return;
              } finally {
                await canvasMcpClient?.close().catch(() => {});
              }
              closeThinkingWindow();
              flushText();
              void Metrics.llmLatency(Date.now() - t0);

              if (finishReason === "tool-calls" && stepCount >= maxToolSteps) {
                const limitMessage =
                  "I hit the tool-call limit before I could finish. Please try again with a narrower request.";
                logger.warn("LLM stream hit tool-call step limit", {
                  model: getLlmModel(),
                  thinkingMode,
                  maxToolSteps,
                  stepCount,
                  toolCallCount,
                });
                parts.push({ type: "error", text: limitMessage });
                await persistAssistant(
                  reply,
                  buildMetadata({
                    partial: true,
                    error: limitMessage,
                    toolCallLimitHit: true,
                  }),
                );
                sendError(writer, limitMessage);
                writer.close();
                return;
              }

              if (!reply.trim()) {
                const emptyReply =
                  "I couldn't generate an answer this time. Please try again.";
                logger.error("LLM stream returned empty response", {
                  model: getLlmModel(),
                  thinkingMode,
                });
                sendToken(writer, emptyReply);
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
                writer.close();
                return;
              }

              await persistAssistant(reply, buildMetadata());
              sendDone(writer);
              writer.close();
            } catch (error) {
              void Metrics.llmError();
              const detail =
                error instanceof Error ? error.message : String(error);
              logger.error("LLM stream failed", {
                error: detail,
                model: getLlmModel(),
                thinkingMode,
              });
              sendError(writer, "Failed to generate response");
              writer.close();
            }
          })();
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

  const ragResult = await runRagPipeline(
    userId,
    message,
    scope.scopedNoteIds,
  );

  const fallbackResults = scope.scopedNoteIds && ragResult.searchResults.length === 0
    ? await runKeywordFallback(userId, message, scope.scopedNoteIds)
    : [];
  const systemPrompt = buildSystemPrompt([...ragResult.searchResults, ...fallbackResults]);
  const sessionMemoryPrompt = buildSessionMemoryPrompt(scope.sessionContext);
  const { uniqueSources, retrieval } = await buildRetrievalInfo(
    userId,
    scope.scopedNoteIds,
    ragResult,
  );

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

    if (finishReason === "tool-calls" && stepCount >= maxToolSteps) {
      const limitMessage =
        "I hit the tool-call limit before I could finish. Please try again with a narrower request.";
      await persistMessage(scope.sessionId, "assistant", reply, {
        parts: [
          ...(reply ? [{ type: "text" as const, text: reply }] : []),
          { type: "error" as const, text: limitMessage },
        ],
        sources: uniqueSources,
        metadata: {
          ...metadata,
          partial: true,
          error: limitMessage,
          toolCallLimitHit: true,
        },
      });
      return tracedError(limitMessage, 502);
    }

    await persistMessage(scope.sessionId, "assistant", reply, {
      sources: uniqueSources,
      metadata,
    });
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
