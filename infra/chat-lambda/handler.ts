// standalone Lambda handler for the chat endpoint
// runs outside Amplify with a 5-minute timeout and real response streaming
//
// build: npx esbuild infra/chat-lambda/handler.ts --bundle --platform=node --target=node20 \
//        --outfile=infra/chat-lambda/dist/index.mjs --format=esm --external:pg-native \
//        --alias:@=./src --loader:.js=ts
// deploy: see infra/chat-lambda/deploy.sh

import jwt from "jsonwebtoken";
import sql from "@/database/pgsql.js";
import { isValidUUID, generateUUID } from "@/lib/utils/uuid";
import { Metrics } from "@/lib/metrics";
import {
  buildThinkingOptions,
  createLlmProvider,
  getLlmMaxTokens,
  getLlmModel,
  getLlmThinkingMode,
  type LlmThinkingMode,
} from "@/lib/ai-config";
import type { MoonshotAILanguageModelOptions } from "@ai-sdk/moonshotai";
import { toSseEvent } from "@/lib/chat/sse";
import logger from "@/lib/logger";
import { streamText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { addNoteToTree } from "@/lib/notes/storage/pg-tree.js";
import { getStorageProvider } from "@/lib/storage/init";
import { chunkText } from "@/lib/chunking";
import { replaceNoteEmbeddings } from "@/lib/rag/indexing";
import { processExtractedText } from "@/lib/canvas/text-processing.js";
import { cacheInvalidate, cacheKeys } from "@/lib/cache";
import { resolveAppOrigin } from "@/lib/chat/canvas-mcp-client";
import { getOptionalCanvasTooling } from "@/lib/chat/canvas-tooling";

import {
  normalizeUuidList,
  resolveScopedNoteIds,
  buildSystemPrompt,
  runRagPipeline,
} from "@/lib/chat/rag-pipeline";
import { searchChatChunks } from "@/lib/chat/chunk-search";
import {
  type ChatMessage,
  type ChatSessionContext,
  type ChatSessionContextItem,
  persistMessage,
  loadSessionContext,
  recordSessionAccesses,
  recordSessionCreatedNote,
  resolveSession,
  setSessionScope,
  loadHistory,
} from "@/lib/chat/session";

// ── Lambda runtime types ────────────────────────────────────────────────────

declare const awslambda: {
  streamifyResponse: (
    handler: (event: any, responseStream: any, context: any) => Promise<void>,
  ) => any;
  HttpResponseStream: {
    from: (stream: any, metadata: any) => any;
  };
};

// ── helpers (same as route.ts) ──────────────────────────────────────────────

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

function normalizeScopeItems(value: unknown): ChatSessionContextItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: ChatSessionContextItem[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as { id?: unknown; title?: unknown };
    const id = typeof item.id === "string" ? item.id.trim() : "";
    if (!isValidUUID(id) || seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      title:
        typeof item.title === "string" && item.title.trim()
          ? item.title.trim().slice(0, 200)
          : "Untitled",
    });
  }
  return items;
}

function buildSessionMemoryPrompt(context: ChatSessionContext): string {
  const lines: string[] = [];
  const scopeNotes = context.scope.notes.slice(0, 4);
  const scopeFolders = context.scope.folders.slice(0, 4);
  if (scopeNotes.length > 0 || scopeFolders.length > 0) {
    const parts: string[] = [];
    if (scopeNotes.length > 0)
      parts.push(
        `notes: ${scopeNotes.map((n) => `"${n.title}" (id: ${n.id})`).join(", ")}`,
      );
    if (scopeFolders.length > 0)
      parts.push(
        `folders: ${scopeFolders.map((f) => `"${f.title}" (id: ${f.id})`).join(", ")}`,
      );
    lines.push(`Active session scope -> ${parts.join("; ")}`);
  }
  const recentAccesses = context.recentAccesses.slice(0, 6);
  if (recentAccesses.length > 0)
    lines.push(
      `Recent notes touched -> ${recentAccesses.map((a) => `${a.kind}: "${a.title}"`).join(", ")}`,
    );
  if (context.lastFolder)
    lines.push(
      `Last folder used for note creation -> "${context.lastFolder.title}" (id: ${context.lastFolder.id})`,
    );
  return lines.length > 0 ? `SESSION MEMORY:\n${lines.join("\n")}` : "";
}

// ── auth ────────────────────────────────────────────────────────────────────

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

// ── SSE writer helper ───────────────────────────────────────────────────────

function sseWriter(stream: any) {
  const encoder = new TextEncoder();
  return {
    event(name: string, data: unknown) {
      stream.write(encoder.encode(toSseEvent(name, data)));
    },
    comment(text: string) {
      stream.write(encoder.encode(`: ${text}\n\n`));
    },
    end() {
      stream.end();
    },
  };
}

// ── handler ─────────────────────────────────────────────────────────────────

export const handler = awslambda.streamifyResponse(
  async (event: any, responseStream: any, _context: any) => {
    // CORS headers are set by the Function URL config — don't duplicate them
    // here or the browser sees "origin, origin" and rejects the response
    const httpStream = awslambda.HttpResponseStream.from(responseStream, {
      statusCode: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
      },
    });

    const sse = sseWriter(httpStream);

    // preflight is handled by the Function URL CORS config
    if (event.requestContext?.http?.method === "OPTIONS") {
      httpStream.end();
      return;
    }

    try {
      // auth
      const auth = verifyToken(event.headers?.authorization);
      if (!auth) {
        sse.event("error", { message: "Unauthorized" });
        sse.end();
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
      } = body;

      const thinkingMode: LlmThinkingMode =
        requestedThinkingMode === "on" ||
        requestedThinkingMode === "off" ||
        requestedThinkingMode === "auto"
          ? requestedThinkingMode
          : getLlmThinkingMode();

      if (!message?.trim()) {
        sse.event("error", { message: "message is required" });
        sse.end();
        return;
      }

      sse.comment("connected");

      // ── scope normalization ─────────────────────────────────────────────

      const hasExplicitScope =
        "noteId" in body ||
        "noteIds" in body ||
        "folderIds" in body ||
        "selectedNotes" in body ||
        "selectedFolders" in body;

      const explicitScopedNotes = normalizeScopeItems(selectedNotes);
      const explicitScopedFolders = normalizeScopeItems(selectedFolders);

      const validNoteId =
        noteId && isValidUUID(noteId) ? noteId : undefined;
      const dedupedNoteIds = normalizeUuidList(noteIds);
      if (
        validNoteId &&
        !explicitScopedNotes.some((item) => item.id === validNoteId)
      )
        explicitScopedNotes.push({
          id: validNoteId,
          title: noteTitle ?? "Untitled",
        });
      for (const id of dedupedNoteIds)
        if (!explicitScopedNotes.some((item) => item.id === id))
          explicitScopedNotes.push({
            id,
            title: id === validNoteId ? (noteTitle ?? "Untitled") : "Untitled",
          });
      for (const id of normalizeUuidList(folderIds))
        if (!explicitScopedFolders.some((item) => item.id === id))
          explicitScopedFolders.push({ id, title: "Folder" });

      const sessionNoteId =
        explicitScopedFolders.length === 0 &&
        explicitScopedNotes.length === 1
          ? explicitScopedNotes[0].id
          : undefined;

      // ── session + scope (DB) ────────────────────────────────────────────

      const sessionId = await resolveSession(
        userId,
        requestedSessionId,
        sessionNoteId,
        message,
      );

      const persistedSessionContext = await loadSessionContext(sessionId);
      const effectiveScope = hasExplicitScope
        ? { notes: explicitScopedNotes, folders: explicitScopedFolders }
        : persistedSessionContext.scope;

      const effectiveSessionContext = hasExplicitScope
        ? await setSessionScope(
            sessionId,
            effectiveScope.notes,
            effectiveScope.folders,
          )
        : persistedSessionContext;

      const scopedInputNoteIds = effectiveScope.notes.map((i) => i.id);
      const scopedInputFolderIds = effectiveScope.folders.map((i) => i.id);
      const scopedNoteIds = await resolveScopedNoteIds(
        userId,
        scopedInputNoteIds,
        scopedInputFolderIds,
      );

      const history = await loadHistory(
        sessionId,
        requestedSessionId,
        requestHistory,
      );
      await persistMessage(sessionId, "user", message);

      // ── RAG pipeline ────────────────────────────────────────────────────

      const { searchResults, semanticMatches, embeddingAvailable, ragFailed } =
        await runRagPipeline(userId, message, scopedNoteIds);

      const systemPrompt = buildSystemPrompt(searchResults);
      const sessionMemoryPrompt =
        buildSessionMemoryPrompt(effectiveSessionContext);
      const uniqueSources = [
        ...new Set(searchResults.map((r) => r.note_id)),
      ].map((id) => {
        const r = searchResults.find((s) => s.note_id === id)!;
        return { id: r.note_id, title: r.title };
      });
      const semanticHits = [
        ...new Set(semanticMatches.map((r) => r.note_id)),
      ].map((id) => {
        const r = semanticMatches.find((s) => s.note_id === id)!;
        return { id: r.note_id, title: r.title };
      });

      let availableFiles: { id: string; title: string }[] = [];
      let availableCount = 0;
      let scopeMode: "global" | "scoped" = "global";

      if (scopedNoteIds && scopedNoteIds.length > 0) {
        scopeMode = "scoped";
        const [scopedRows, scopedCountRows] = await Promise.all([
          sql`SELECT n.note_id, n.title FROM app.notes n JOIN (SELECT DISTINCT c.document_id FROM app.chunks c WHERE c.user_id = ${userId}::uuid AND c.document_id = ANY(${scopedNoteIds}::uuid[])) indexed ON indexed.document_id = n.note_id WHERE n.user_id = ${userId}::uuid AND n.is_folder = false AND n.deleted = 0 AND n.deleted_at IS NULL ORDER BY n.title ASC LIMIT 24`,
          sql`SELECT COUNT(DISTINCT c.document_id)::int AS total FROM app.chunks c JOIN app.notes n ON n.note_id = c.document_id WHERE c.user_id = ${userId}::uuid AND c.document_id = ANY(${scopedNoteIds}::uuid[]) AND n.is_folder = false AND n.deleted = 0 AND n.deleted_at IS NULL`,
        ]);
        availableFiles = (
          scopedRows as { note_id: string; title: string }[]
        ).map((r) => ({ id: r.note_id, title: r.title }));
        availableCount = Number(
          (scopedCountRows as { total: number }[])[0]?.total ?? 0,
        );
      } else {
        const indexedRows = await sql`SELECT COUNT(DISTINCT c.document_id)::int AS total FROM app.chunks c JOIN app.notes n ON n.note_id = c.document_id WHERE c.user_id = ${userId}::uuid AND n.is_folder = false AND n.deleted = 0 AND n.deleted_at IS NULL`;
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

      const provider = createLlmProvider();
      const model = provider ? provider(getLlmModel()) : null;
      const llmAvailable = !!model;

      // ── send meta + search events ───────────────────────────────────────

      sse.event("meta", {
        sessionId,
        sources: uniqueSources,
        retrieval,
        ragAvailable: !ragFailed,
        llmAvailable,
      });
      sse.event("search", {
        scopeSize: scopedNoteIds?.length ?? null,
        resultsFound: searchResults.length,
        results: searchResults.map((r) => ({
          noteId: r.note_id,
          title: r.title || "Untitled",
          distance: r.distance,
        })),
      });

      const fallbackReply =
        searchResults.length > 0
          ? `Found ${searchResults.length} relevant chunk(s) from: ${[...new Set(searchResults.map((r) => `"${r.title || "Untitled"}"`))].join(", ")}. Connect an LLM (set LLM_API_URL) to get AI-generated answers.`
          : embeddingAvailable
            ? "No relevant notes found. Try uploading a PDF to build your knowledge base."
            : "Embedding service unavailable. Set COHERE_API_KEY to enable semantic search.";

      if (!llmAvailable) {
        sse.event("token", { text: fallbackReply });
        await persistMessage(sessionId, "assistant", fallbackReply, uniqueSources);
        sse.event("done", {});
        sse.end();
        return;
      }

      // ── parent folder hint + tools ──────────────────────────────────────

      let scopedParentHint = "";
      if (scopedInputNoteIds.length > 0) {
        const parentRows = await sql`
          SELECT DISTINCT ti.parent_id, n.note_id, n.title
          FROM app.tree_items ti
          JOIN app.notes n ON n.note_id = ti.parent_id::uuid
          WHERE ti.note_id = ANY(${scopedInputNoteIds}::uuid[])
            AND ti.parent_id IS NOT NULL AND n.is_folder = true
            AND n.deleted = 0 AND n.user_id = ${userId}::uuid
          LIMIT 5
        `;
        if ((parentRows as any[]).length > 0) {
          const hints = (parentRows as { note_id: string; title: string }[])
            .map((r) => `"${r.title}" (id: ${r.note_id})`)
            .join(", ");
          scopedParentHint =
            `\nThe current note's parent folder(s): ${hints}. ` +
            "Use the most relevant folder's id as parentID when creating a note — no need to call findFolder.";
        }
      }
      if (!scopedParentHint && effectiveSessionContext.lastFolder)
        scopedParentHint =
          `\nLast folder used for note creation: "${effectiveSessionContext.lastFolder.title}" ` +
          `(id: ${effectiveSessionContext.lastFolder.id}). Use that parentID directly when it fits.`;

      const appOrigin = resolveAppOrigin({
        requestOrigin: event.headers?.origin,
        referer: event.headers?.referer,
      });
      const {
        client: canvasMcpClient,
        tools: canvasTools,
        instruction: canvasInstruction,
      } = await getOptionalCanvasTooling({
        userId,
        appOrigin,
      });

      const toolInstruction =
        "Tools available:\n" +
        "- getChunks({ query, mode?, scope? }) — search notes for relevant chunks. mode: 'semantic' (default, conceptual match), 'exact' (literal phrase/term), 'both'. scope: 'session' (default, stay in current scope) or 'all' (search across all notes). Returns chunk text + noteId per hit.\n" +
        "- readNote({ noteId }) — read the full markdown content of a note. Use after getChunks confirms the right note.\n" +
        "- findFolder({ query }) — search for a folder/course directory by name. Use when parent folder is not already known.\n" +
        "- makeMDNote({ text, parentID?, title? }) — create a markdown note. Set parentID to place it in the right folder.\n" +
        "When the user asks to create/save/write a note: if you already know the parentID (from context below), call makeMDNote directly. Otherwise call findFolder first. Prefer session scope first. Only use scope='all' when the user asks to search beyond the current scope or when scoped search clearly isn't enough." +
        scopedParentHint +
        (canvasInstruction ? `\n\n${canvasInstruction}` : "");

      // ── tool definitions ────────────────────────────────────────────────

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
          let parentFolder: ChatSessionContextItem | null = null;
          if (parentID) {
            const parentRows = await sql`SELECT note_id, title, is_folder FROM app.notes WHERE note_id = ${parentID}::uuid AND user_id = ${userId}::uuid AND deleted = 0 AND deleted_at IS NULL LIMIT 1`;
            if (!parentRows[0]) throw new Error("parentID does not exist");
            if (!parentRows[0].is_folder) throw new Error("parentID must be a folder");
            parentFolder = { id: parentID, title: parentRows[0].title || "Folder" };
          }
          const resolvedTitle = (title?.trim() || inferNoteTitle(trimmed)).slice(0, 500);
          const markdown = trimmed.startsWith("#") || trimmed.startsWith("---") ? trimmed : `# ${resolvedTitle}\n\n${trimmed}`;
          const fileName = sanitizeFileName(`${resolvedTitle || "AI_Note"}.md`);
          const markdownBuffer = Buffer.from(markdown, "utf-8");
          const newNoteId = generateUUID();
          const storagePath = `notes/${newNoteId}/${fileName}`;
          const extractedText = processExtractedText(markdown);
          const storage = getStorageProvider();
          await storage.putObject(storagePath, markdownBuffer, { contentType: "text/markdown" });
          await sql`INSERT INTO app.notes (note_id, user_id, title, content, is_folder, deleted, created_at, updated_at) VALUES (${newNoteId}::uuid, ${userId}::uuid, ${resolvedTitle}, ${markdown}, false, 0, NOW(), NOW())`;
          await addNoteToTree(userId, newNoteId, parentID || null);
          const attachmentId = generateUUID();
          await sql`INSERT INTO app.attachments (id, note_id, user_id, filename, s3_key, mime_type, file_size) VALUES (${attachmentId}::uuid, ${newNoteId}::uuid, ${userId}::uuid, ${fileName}, ${storagePath}, ${"text/markdown"}, ${markdownBuffer.length})`;
          await sql`UPDATE app.notes SET s3_key = ${storagePath}, extracted_text = ${extractedText}, updated_at = NOW() WHERE note_id = ${newNoteId}::uuid AND user_id = ${userId}::uuid`;
          await replaceNoteEmbeddings(newNoteId, userId, chunkText(markdown));
          await cacheInvalidate(cacheKeys.treeChildren(userId, parentID || null), cacheKeys.treeFull(userId), cacheKeys.notesList(userId, 0, undefined), cacheKeys.note(userId, newNoteId));
          await recordSessionCreatedNote(sessionId, { id: newNoteId, title: resolvedTitle }, parentFolder);
          return { noteId: newNoteId, attachmentId, title: resolvedTitle, parentID: parentID || null, s3Key: storagePath, noteUrl: `/notes/${newNoteId}` };
        },
      });

      const findFolder = tool({
        description: "Search for a folder by name or course keyword. Returns matching folders with IDs.",
        inputSchema: z.object({ query: z.string().min(1).max(200) }),
        execute: async ({ query }) => {
          const rows = await sql`SELECT note_id, title FROM app.notes WHERE user_id = ${userId}::uuid AND is_folder = true AND deleted = 0 AND deleted_at IS NULL AND title ILIKE ${"%" + query.replace(/%/g, "\\%").replace(/_/g, "\\_") + "%"} ORDER BY title ASC LIMIT 10`;
          return { folders: (rows as { note_id: string; title: string }[]).map((r) => ({ id: r.note_id, title: r.title })) };
        },
      });

      const getChunks = tool({
        description: "Search notes for relevant chunks. mode: semantic/exact/both. scope: session/all.",
        inputSchema: z.object({
          query: z.string().min(1).max(300),
          mode: z.enum(["semantic", "exact", "both"]).default("semantic"),
          scope: z.enum(["session", "all"]).default("session"),
        }),
        execute: async ({ query, mode, scope }) => {
          const results = await searchChatChunks({ userId, query, mode, scopedNoteIds: scope === "all" ? null : scopedNoteIds });
          await recordSessionAccesses(sessionId, [...new Map(results.map((r) => [r.noteId, { id: r.noteId, title: r.title || "Untitled", kind: "search-hit" as const }])).values()].slice(0, 6));
          return { results };
        },
      });

      const readNote = tool({
        description: "Read full content of a note by ID.",
        inputSchema: z.object({ noteId: z.string().uuid() }),
        execute: async ({ noteId: readNoteId }) => {
          const [row] = await sql`SELECT title, content, extracted_text FROM app.notes WHERE note_id = ${readNoteId}::uuid AND user_id = ${userId}::uuid AND is_folder = false AND deleted = 0 AND deleted_at IS NULL`;
          if (!row) return { error: "Note not found" };
          await recordSessionAccesses(sessionId, [{ id: readNoteId, title: row.title || "Untitled", kind: "read" }]);
          return { noteId: readNoteId, title: row.title, content: (row.content || row.extracted_text || "").slice(0, 20_000) };
        },
      });

      // ── build LLM messages + stream ─────────────────────────────────────

      const chatMessages: ChatMessage[] = [
        {
          role: "system",
          content: [systemPrompt, sessionMemoryPrompt, toolInstruction]
            .filter(Boolean)
            .join("\n\n"),
        },
        ...history.slice(-20),
        { role: "user", content: message },
      ];

      const thinkingOptions = buildThinkingOptions(thinkingMode);
      const moonshotOptions: MoonshotAILanguageModelOptions = {
        thinking: thinkingOptions,
      };

      const t0 = Date.now();
      let reply = "";
      const result = streamText({
        model: model!,
        messages: chatMessages,
        maxOutputTokens: getLlmMaxTokens(),
        ...(thinkingMode !== "off" && { temperature: 1 }),
        stopWhen: stepCountIs(50),
        tools: {
          getChunks,
          readNote,
          findFolder,
          makeMDNote,
          ...canvasTools,
        },
        providerOptions: { moonshotai: moonshotOptions },
      });

      try {
        for await (const part of result.fullStream) {
          if (part.type === "reasoning-delta") {
            sse.event("thinking", { text: part.text });
          } else if (part.type === "text-delta") {
            reply += part.text;
            sse.event("token", { text: part.text });
          } else if (part.type === "tool-call") {
            sse.event("tool-call", { toolName: part.toolName });
          }
        }
      } finally {
        await canvasMcpClient?.close().catch(() => {});
      }
      void Metrics.llmLatency(Date.now() - t0);

      if (!reply.trim()) {
        const emptyReply =
          "I couldn't generate an answer this time. Please try again.";
        logger.error("LLM stream returned empty response", {
          model: getLlmModel(),
          thinkingMode,
        });
        sse.event("token", { text: emptyReply });
        await persistMessage(sessionId, "assistant", emptyReply, uniqueSources);
        sse.event("done", {});
        sse.end();
        return;
      }

      await persistMessage(sessionId, "assistant", reply, uniqueSources);
      sse.event("done", {});
      sse.end();
    } catch (error) {
      void Metrics.llmError();
      const detail = error instanceof Error ? error.message : String(error);
      logger.error("Chat lambda failed", { error: detail });
      sse.event("error", { message: "Failed to generate response" });
      sse.end();
    }
  },
);
