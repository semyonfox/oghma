// standalone Lambda handler for the chat endpoint
// runs outside Amplify with a 5-minute timeout and real response streaming
//
// build: npx esbuild infra/chat-lambda/handler.ts --bundle --platform=node --target=node20 \
//        --outfile=infra/chat-lambda/dist/index.mjs --format=esm --external:pg-native \
//        --alias:@=./src --loader:.js=ts
// deploy: see infra/chat-lambda/deploy.sh

import jwt from "jsonwebtoken";
import { Metrics } from "@/lib/metrics";
import { getLlmModel, getLlmThinkingMode, type LlmThinkingMode } from "@/lib/ai-config";
import logger from "@/lib/logger";
import { streamText } from "ai";
import { persistMessage } from "@/lib/chat/session";
import { runRagPipeline, buildSystemPrompt, runKeywordFallback } from "@/lib/chat/rag-pipeline";
import { normalizeScope, buildSessionMemoryPrompt } from "@/lib/chat/normalize-scope";
import { buildRetrievalInfo, buildFallbackReply } from "@/lib/chat/rag-context";
import { buildLlmCall } from "@/lib/chat/build-stream";
import {
  type SseWriter,
  sendMeta,
  sendSearch,
  sendToken,
  sendThinking,
  sendToolCall,
  sendDone,
  sendError,
} from "@/lib/chat/stream-events";
import { toSseEvent } from "@/lib/chat/sse";

// ── Lambda runtime types ────────────────────────────────────────────────────

declare const awslambda: {
  streamifyResponse: (
    handler: (event: any, responseStream: any, context: any) => Promise<void>,
  ) => any;
  HttpResponseStream: {
    from: (stream: any, metadata: any) => any;
  };
};

// ── Lambda-specific helpers ─────────────────────────────────────────────────

function verifyToken(
  authHeader: string | undefined,
): { userId: string; email: string } | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      sub: string;
      email: string;
    };
    if (!payload.sub) return null;
    return { userId: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

// adapts the Lambda response stream to the SseWriter interface used by stream-events.ts
function lambdaSseWriter(stream: any): SseWriter & { sendComment(text: string): void; end(): void } {
  const encoder = new TextEncoder();
  return {
    enqueue: (chunk: Uint8Array) => stream.write(chunk),
    close: () => stream.end(),
    sendComment(text: string) {
      stream.write(encoder.encode(`: ${text}\n\n`));
    },
    end() {
      stream.end();
    },
  };
}

// sends a raw SSE event to the Lambda stream (for error events before shared writer setup)
function sendRawEvent(stream: any, event: string, data: unknown): void {
  const encoder = new TextEncoder();
  stream.write(encoder.encode(toSseEvent(event, data)));
}

// ── handler ─────────────────────────────────────────────────────────────────

export const handler = awslambda.streamifyResponse(
  async (event: any, responseStream: any, _context: any) => {
    const httpStream = awslambda.HttpResponseStream.from(responseStream, {
      statusCode: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
      },
    });

    // preflight is handled by the Function URL CORS config
    if (event.requestContext?.http?.method === "OPTIONS") {
      httpStream.end();
      return;
    }

    const writer = lambdaSseWriter(httpStream);

    try {
      // auth
      const auth = verifyToken(event.headers?.authorization);
      if (!auth) {
        sendRawEvent(httpStream, "error", { message: "Unauthorized" });
        httpStream.end();
        return;
      }
      const { userId } = auth;

      // parse body
      const body = event.body
        ? JSON.parse(event.isBase64Encoded
            ? Buffer.from(event.body, "base64").toString()
            : event.body)
        : {};

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
        thinkingMode: requestedThinkingMode,
        clientNow,
      } = body;

      const thinkingMode: LlmThinkingMode =
        requestedThinkingMode === "on" ||
        requestedThinkingMode === "off" ||
        requestedThinkingMode === "auto"
          ? requestedThinkingMode
          : getLlmThinkingMode();

      if (!message?.trim()) {
        sendRawEvent(httpStream, "error", { message: "message is required" });
        httpStream.end();
        return;
      }

      writer.sendComment("connected");

      // ── scope normalization ─────────────────────────────────────────────

      const scope = await normalizeScope(
        userId,
        { noteId, noteTitle, noteIds, folderIds, selectedNotes, selectedFolders },
        body,
        requestedSessionId,
        message,
        requestHistory,
      );

      // ── RAG pipeline ────────────────────────────────────────────────────

      const ragResult = await runRagPipeline(userId, message, scope.scopedNoteIds);
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

      // ── build LLM call ─────────────────────────────────────────────────

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
          clientNow: typeof clientNow === "string" ? clientNow : undefined,
          requestOrigin: event.headers?.origin ?? "",
          referer: event.headers?.referer ?? null,
        });

      // ── send meta + search events ───────────────────────────────────────

      sendMeta(writer, scope.sessionId, uniqueSources, retrieval, !ragResult.ragFailed, llmAvailable);
      sendSearch(writer, scope.scopedNoteIds, ragResult.searchResults);

      if (!llmAvailable) {
        const fallback = buildFallbackReply(ragResult.searchResults, ragResult.embeddingAvailable);
        sendToken(writer, fallback);
        await persistMessage(scope.sessionId, "assistant", fallback, uniqueSources);
        sendDone(writer);
        writer.end();
        return;
      }

      // ── stream LLM response ────────────────────────────────────────────

      const t0 = Date.now();
      let reply = "";
      try {
        const result = streamText({ model: model!, ...llmCallOptions });
        for await (const part of result.fullStream) {
          if (part.type === "reasoning-delta") {
            sendThinking(writer, part.text);
          } else if (part.type === "text-delta") {
            reply += part.text;
            sendToken(writer, part.text);
          } else if (part.type === "tool-call") {
            sendToolCall(writer, part.toolName);
          }
        }
      } finally {
        await canvasMcpClient?.close().catch(() => {});
      }
      void Metrics.llmLatency(Date.now() - t0);

      if (!reply.trim()) {
        const emptyReply = "I couldn't generate an answer this time. Please try again.";
        logger.error("LLM stream returned empty response", { model: getLlmModel(), thinkingMode });
        sendToken(writer, emptyReply);
        await persistMessage(scope.sessionId, "assistant", emptyReply, uniqueSources);
        sendDone(writer);
        writer.end();
        return;
      }

      await persistMessage(scope.sessionId, "assistant", reply, uniqueSources);
      sendDone(writer);
      writer.end();
    } catch (error) {
      void Metrics.llmError();
      const detail = error instanceof Error ? error.message : String(error);
      logger.error("Chat lambda failed", { error: detail });
      sendError(writer, "Failed to generate response");
      writer.end();
    }
  },
);
