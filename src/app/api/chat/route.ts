import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimiter";
import { isValidUUID } from "@/lib/utils/uuid";
import { Metrics } from "@/lib/metrics";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import {
  getLlmMaxTokens,
  getLlmModel,
  getLlmThinkingMode,
  type LlmThinkingMode,
} from "@/lib/ai-config";
import { toSseEvent } from "@/lib/chat/sse";
import { getTraceId } from "@/lib/trace";
import logger from "@/lib/logger";
import { streamText, generateText, tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import sql from "@/database/pgsql.js";
import { addNoteToTree } from "@/lib/notes/storage/pg-tree.js";
import { generateUUID } from "@/lib/utils/uuid";
import { getStorageProvider } from "@/lib/storage/init";
import { chunkText } from "@/lib/chunking";
import { replaceNoteEmbeddings } from "@/lib/rag/indexing";
import { processExtractedText } from "@/lib/canvas/text-processing.js";
import { cacheInvalidate, cacheKeys } from "@/lib/cache";

import { type ChatMessage } from "@/lib/chat/llm-caller";
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

function inferNoteTitle(content: string): string {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading.slice(0, 120);
  const firstLine = content
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (firstLine) return firstLine.slice(0, 120);
  return "AI Note";
}

function sanitizeFileName(raw: string): string {
  return raw
    .replace(/^\.+/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.{2,}/g, ".")
    .substring(0, 255);
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
  const {
    searchResults,
    semanticMatches,
    embeddingAvailable,
    ragFailed,
  } = await runRagPipeline(
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

  const semanticHits = [...new Set(semanticMatches.map((r) => r.note_id))].map(
    (id) => {
      const r = semanticMatches.find((s) => s.note_id === id)!;
      return { id: r.note_id, title: r.title };
    },
  );

  let availableFiles: { id: string; title: string }[] = [];
  let availableCount = 0;
  let scopeMode: "global" | "scoped" = "global";

  if (scopedNoteIds && scopedNoteIds.length > 0) {
    scopeMode = "scoped";
    const scopedRows = await sql`
      SELECT n.note_id, n.title
      FROM app.notes n
      JOIN (
        SELECT DISTINCT c.document_id
        FROM app.chunks c
        WHERE c.user_id = ${userId}::uuid
          AND c.document_id = ANY(${scopedNoteIds}::uuid[])
      ) indexed ON indexed.document_id = n.note_id
      WHERE n.user_id = ${userId}::uuid
        AND n.is_folder = false
        AND n.deleted = 0
        AND n.deleted_at IS NULL
      ORDER BY n.title ASC
      LIMIT 24
    `;
    availableFiles = (scopedRows as { note_id: string; title: string }[]).map(
      (r) => ({ id: r.note_id, title: r.title }),
    );
    const scopedCountRows = await sql`
      SELECT COUNT(DISTINCT c.document_id)::int AS total
      FROM app.chunks c
      JOIN app.notes n ON n.note_id = c.document_id
      WHERE c.user_id = ${userId}::uuid
        AND c.document_id = ANY(${scopedNoteIds}::uuid[])
        AND n.is_folder = false
        AND n.deleted = 0
        AND n.deleted_at IS NULL
    `;
    availableCount = Number(
      (scopedCountRows as { total: number }[])[0]?.total ?? 0,
    );
  } else {
    const indexedRows = await sql`
      SELECT COUNT(DISTINCT c.document_id)::int AS total
      FROM app.chunks c
      JOIN app.notes n ON n.note_id = c.document_id
      WHERE c.user_id = ${userId}::uuid
        AND n.is_folder = false
        AND n.deleted = 0
        AND n.deleted_at IS NULL
    `;
    availableCount = Number(
      (indexedRows as { total: number }[])[0]?.total ?? 0,
    );
  }

  const retrieval = {
    scopeMode,
    availableCount,
    availableFiles,
    semanticHits,
    usedFiles: uniqueSources,
  };

  const fallbackReply =
    searchResults.length > 0
      ? `Found ${searchResults.length} relevant chunk(s) from: ${[...new Set(searchResults.map((r) => `"${r.title || "Untitled"}"`))].join(", ")}. Connect an LLM (set LLM_API_URL) to get AI-generated answers.`
      : embeddingAvailable
        ? "No relevant notes found. Try uploading a PDF to build your knowledge base."
        : "Embedding service unavailable. Set COHERE_API_KEY to enable semantic search.";

  const llmApiUrl = process.env.LLM_API_URL;
  const llmApiKey = process.env.LLM_API_KEY;

  const openai = llmApiUrl && llmApiKey
    ? createOpenAI({
        baseURL: llmApiUrl.replace(/\/$/, ""),
        apiKey: llmApiKey,
      })
    : null;

  const model = openai ? openai(getLlmModel()) : null;

  const toolInstruction =
    "Tool available: makeMDNote({ text, parentID?, title? }). " +
    "When the user asks to create/save/write a markdown note, call this tool instead of pretending it was saved.";

  const chatMessages: ChatMessage[] = [
    { role: "system", content: `${systemPrompt}\n\n${toolInstruction}` },
    ...history.slice(-8),
    { role: "user", content: message },
  ];

  const makeMDNote = tool({
    description:
      "Create a markdown note for the current user. Use parentID to place it under a folder.",
    inputSchema: z.object({
      text: z.string().min(1).max(200_000),
      parentID: z.string().uuid().nullable().optional(),
      title: z.string().min(1).max(500).optional(),
    }),
    execute: async ({ text, parentID, title }) => {
      const trimmed = text.trim();
      if (!trimmed) throw new Error("text cannot be empty");

      if (parentID) {
        const parentRows = await sql`
          SELECT note_id, is_folder
          FROM app.notes
          WHERE note_id = ${parentID}::uuid
            AND user_id = ${userId}::uuid
            AND deleted = 0
            AND deleted_at IS NULL
          LIMIT 1
        `;
        if (!parentRows[0]) {
          throw new Error("parentID does not exist for this user");
        }
        if (!parentRows[0].is_folder) {
          throw new Error("parentID must reference a folder");
        }
      }

      const resolvedTitle = (title?.trim() || inferNoteTitle(trimmed)).slice(
        0,
        500,
      );
      const markdown =
        trimmed.startsWith("#") || trimmed.startsWith("---")
          ? trimmed
          : `# ${resolvedTitle}\n\n${trimmed}`;
      const fileName = sanitizeFileName(`${resolvedTitle || "AI_Note"}.md`);
      const markdownBuffer = Buffer.from(markdown, "utf-8");

      const noteId = generateUUID();
      const storagePath = `notes/${noteId}/${fileName}`;
      const extractedText = processExtractedText(markdown);

      const storage = getStorageProvider();
      await storage.putObject(storagePath, markdownBuffer, {
        contentType: "text/markdown",
      });

      await sql`
        INSERT INTO app.notes (note_id, user_id, title, content, is_folder, deleted, created_at, updated_at)
        VALUES (${noteId}::uuid, ${userId}::uuid, ${resolvedTitle}, ${markdown}, false, 0, NOW(), NOW())
      `;
      await addNoteToTree(userId, noteId, parentID || null);
      const attachmentId = generateUUID();
      await sql`
        INSERT INTO app.attachments (id, note_id, user_id, filename, s3_key, mime_type, file_size)
        VALUES (
          ${attachmentId}::uuid,
          ${noteId}::uuid,
          ${userId}::uuid,
          ${fileName},
          ${storagePath},
          ${"text/markdown"},
          ${markdownBuffer.length}
        )
      `;

      await sql`
        UPDATE app.notes
        SET s3_key = ${storagePath}, extracted_text = ${extractedText}, updated_at = NOW()
        WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
      `;

      await replaceNoteEmbeddings(noteId, userId, chunkText(markdown));

      await cacheInvalidate(
        cacheKeys.treeChildren(userId, parentID || null),
        cacheKeys.treeFull(userId),
        cacheKeys.notesList(userId, 0, undefined),
        cacheKeys.note(userId, noteId),
      );

      return {
        noteId,
        attachmentId,
        title: resolvedTitle,
        parentID: parentID || null,
        s3Key: storagePath,
        noteUrl: `/notes/${noteId}`,
      };
    },
  });

  // ── Streaming response ──────────────────────────────────────────────────────
  if (stream) {
    const encoder = new TextEncoder();
    const llmAvailable = !!model;
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
                    retrieval,
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
              const result = streamText({
                model: model!,
                messages: chatMessages,
                maxTokens: getLlmMaxTokens(),
                maxSteps: 4,
                tools: { makeMDNote },
              });
              for await (const token of result.textStream) {
                reply += token;
                controller.enqueue(
                  encoder.encode(toSseEvent("token", { text: token })),
                );
              }
              void Metrics.llmLatency(Date.now() - t0);

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
                thinkingMode, // currently retained for compatibility/UI; provider may ignore it
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
  if (!model) {
    await persistMessage(sessionId, "assistant", fallbackReply, uniqueSources);
    return NextResponse.json({
      reply: fallbackReply,
      sources: uniqueSources,
      retrieval,
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
    const { text: reply } = await generateText({
      model,
      messages: chatMessages,
      maxTokens: getLlmMaxTokens(),
      maxSteps: 4,
      tools: { makeMDNote },
    });
    void Metrics.llmLatency(Date.now() - t0);

    await persistMessage(sessionId, "assistant", reply, uniqueSources);
    return NextResponse.json({
      reply,
      sources: uniqueSources,
      retrieval,
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
