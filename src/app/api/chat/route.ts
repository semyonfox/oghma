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
import type { MessagePart } from "@/lib/chat/types";
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

              const { model, llmAvailable, llmCallOptions, canvasMcpClient } =
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
              const parts: MessagePart[] = [];
              let pendingText = "";
              const flushText = () => {
                if (pendingText) {
                  parts.push({ type: "text", text: pendingText });
                  pendingText = "";
                }
              };
              try {
                const result = streamText({
                  model: model!,
                  ...llmCallOptions,
                });
                for await (const part of result.fullStream) {
                  if (part.type === "reasoning-delta") {
                    sendThinking(writer, part.text);
                  } else if (part.type === "text-delta") {
                    reply += part.text;
                    pendingText += part.text;
                    sendToken(writer, part.text);
                  } else if (part.type === "tool-call") {
                    flushText();
                    parts.push({
                      type: "tool",
                      name: part.toolName,
                      label: labelForTool(part.toolName),
                    });
                    sendToolCall(writer, part.toolName);
                  }
                }
              } finally {
                await canvasMcpClient?.close().catch(() => {});
              }
              flushText();
              void Metrics.llmLatency(Date.now() - t0);

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
                  { sources: uniqueSources },
                );
                sendDone(writer);
                writer.close();
                return;
              }

              await persistMessage(
                scope.sessionId,
                "assistant",
                reply,
                { parts, sources: uniqueSources },
              );
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

  const { model, llmCallOptions, canvasMcpClient } = await buildLlmCall({
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
    const { text: reply, reasoningText } = await (async () => {
      try {
        return await generateText({ model, ...llmCallOptions });
      } finally {
        await canvasMcpClient?.close().catch(() => {});
      }
    })();
    void Metrics.llmLatency(Date.now() - t0);

    await persistMessage(scope.sessionId, "assistant", reply, {
      sources: uniqueSources,
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
