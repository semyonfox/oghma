import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimiter";
import { isValidUUID } from "@/lib/utils/uuid";
import { xraySubsegment } from "@/lib/xray";
import { Metrics } from "@/lib/metrics";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import {
  getLlmModel,
  getLlmThinkingMode,
  type LlmThinkingMode,
} from "@/lib/ai-config";
import { toSseEvent } from "@/lib/chat/sse";
import { getTraceId } from "@/lib/trace";
import logger from "@/lib/logger";

import {
  type ChatMessage,
  callLLM,
  callLLMStream,
} from "@/lib/chat/llm-caller";
import {
  normalizeUuidList,
  resolveScopedNoteIds,
  buildSystemPrompt,
  runRagPipeline,
} from "@/lib/chat/rag-pipeline";
import {
  persistMessage,
  resolveSession,
  loadHistory,
} from "@/lib/chat/session";

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
    noteIds = [],
    folderIds = [],
    sessionId: requestedSessionId,
    history: requestHistory = [],
    stream = false,
    thinkingMode: requestedThinkingMode,
  }: {
    message: string;
    noteId?: string;
    noteIds?: string[];
    folderIds?: string[];
    sessionId?: string;
    history?: ChatMessage[];
    stream?: boolean;
    thinkingMode?: LlmThinkingMode;
  } = body;

  const thinkingMode: LlmThinkingMode =
    requestedThinkingMode === "on" ||
    requestedThinkingMode === "off" ||
    requestedThinkingMode === "auto"
      ? requestedThinkingMode
      : getLlmThinkingMode();

  if (!message?.trim()) return tracedError("message is required", 400);
  if (message.length > 2000)
    return tracedError("message too long (max 2000 characters)", 400);

  // resolve scoped note IDs for RAG context
  const validNoteId = noteId && isValidUUID(noteId) ? noteId : undefined;
  const dedupedNoteIds = normalizeUuidList(noteIds);
  if (validNoteId) dedupedNoteIds.push(validNoteId);
  const scopedInputNoteIds = [...new Set(dedupedNoteIds)];
  const scopedInputFolderIds = normalizeUuidList(folderIds);
  const scopedNoteIds = await resolveScopedNoteIds(
    userId,
    scopedInputNoteIds,
    scopedInputFolderIds,
  );

  const sessionNoteId =
    scopedInputFolderIds.length === 0 && scopedInputNoteIds.length === 1
      ? scopedInputNoteIds[0]
      : undefined;

  const sessionId = await resolveSession(
    userId,
    requestedSessionId,
    sessionNoteId,
    message,
  );

  // load conversation history
  const history = await loadHistory(
    sessionId,
    requestedSessionId,
    requestHistory,
  );

  // persist user message immediately
  await persistMessage(sessionId, "user", message);

  // run RAG pipeline
  const { searchResults, embeddingAvailable, ragFailed } = await runRagPipeline(
    userId,
    message,
    scopedNoteIds,
  );

  const systemPrompt = buildSystemPrompt(searchResults);
  const uniqueSources = [...new Set(searchResults.map((r) => r.note_id))].map(
    (id) => {
      const r = searchResults.find((s) => s.note_id === id)!;
      return { id: r.note_id, title: r.title };
    },
  );

  const fallbackReply =
    searchResults.length > 0
      ? `Found ${searchResults.length} relevant chunk(s) from: ${[...new Set(searchResults.map((r) => `"${r.title || "Untitled"}"`))].join(", ")}. Connect an LLM (set LLM_API_URL) to get AI-generated answers.`
      : embeddingAvailable
        ? "No relevant notes found. Try uploading a PDF to build your knowledge base."
        : "Embedding service unavailable. Set COHERE_API_KEY to enable semantic search.";

  // ── Streaming response ──────────────────────────────────────────────────────
  if (stream) {
    const encoder = new TextEncoder();
    const llmAvailable = !!process.env.LLM_API_URL;
    return new NextResponse(
      new ReadableStream({
        start(controller) {
          void (async () => {
            try {
              controller.enqueue(
                encoder.encode(
                  toSseEvent("meta", {
                    sessionId,
                    sources: uniqueSources,
                    ragAvailable: !ragFailed,
                    llmAvailable,
                  }),
                ),
              );

              // send search context so the UI can show what was found
              controller.enqueue(
                encoder.encode(
                  toSseEvent("search", {
                    scopeSize: scopedNoteIds?.length ?? null,
                    resultsFound: searchResults.length,
                    results: searchResults.map((r) => ({
                      noteId: r.note_id,
                      title: r.title || "Untitled",
                      distance: r.distance,
                    })),
                  }),
                ),
              );

              if (!llmAvailable) {
                controller.enqueue(
                  encoder.encode(toSseEvent("token", { text: fallbackReply })),
                );
                await persistMessage(
                  sessionId,
                  "assistant",
                  fallbackReply,
                  uniqueSources,
                );
                controller.enqueue(encoder.encode(toSseEvent("done", {})));
                controller.close();
                return;
              }

              const t0 = Date.now();
              let reply = "";
              for await (const token of callLLMStream(
                systemPrompt,
                history,
                message,
                thinkingMode,
              )) {
                reply += token;
                controller.enqueue(
                  encoder.encode(toSseEvent("token", { text: token })),
                );
              }
              void Metrics.llmLatency(Date.now() - t0);

              if (!reply.trim()) {
                const emptyReply =
                  "I couldn't generate an answer this time. Please try again.";
                logger.error("LLM stream returned empty response", {
                  model: getLlmModel(),
                  thinkingMode,
                });
                controller.enqueue(
                  encoder.encode(toSseEvent("token", { text: emptyReply })),
                );
                await persistMessage(
                  sessionId,
                  "assistant",
                  emptyReply,
                  uniqueSources,
                );
                controller.enqueue(encoder.encode(toSseEvent("done", {})));
                controller.close();
                return;
              }

              await persistMessage(
                sessionId,
                "assistant",
                reply,
                uniqueSources,
              );
              controller.enqueue(encoder.encode(toSseEvent("done", {})));
              controller.close();
            } catch (error) {
              void Metrics.llmError();
              const detail =
                error instanceof Error ? error.message : String(error);
              logger.error("LLM stream failed", {
                error: detail,
                model: getLlmModel(),
                thinkingMode,
              });
              controller.enqueue(
                encoder.encode(
                  toSseEvent("error", {
                    message: "Failed to generate response",
                    traceId: getTraceId(),
                  }),
                ),
              );
              controller.close();
            }
          })();
        },
      }),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      },
    );
  }

  // ── Non-streaming response ──────────────────────────────────────────────────
  if (!process.env.LLM_API_URL) {
    await persistMessage(sessionId, "assistant", fallbackReply, uniqueSources);
    return NextResponse.json({
      reply: fallbackReply,
      sources: uniqueSources,
      llmAvailable: false,
      sessionId,
      searchContext: {
        scopeSize: scopedNoteIds?.length ?? null,
        resultsFound: searchResults.length,
        results: searchResults.map((r) => ({
          noteId: r.note_id,
          title: r.title || "Untitled",
          distance: r.distance,
        })),
      },
    });
  }

  try {
    const t0 = Date.now();
    const reply = await xraySubsegment("llm-call", () =>
      callLLM(systemPrompt, history, message, thinkingMode),
    );
    void Metrics.llmLatency(Date.now() - t0);

    await persistMessage(sessionId, "assistant", reply, uniqueSources);
    return NextResponse.json({
      reply,
      sources: uniqueSources,
      llmAvailable: true,
      ragAvailable: !ragFailed,
      sessionId,
      searchContext: {
        scopeSize: scopedNoteIds?.length ?? null,
        resultsFound: searchResults.length,
        results: searchResults.map((r) => ({
          noteId: r.note_id,
          title: r.title || "Untitled",
          distance: r.distance,
        })),
      },
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
