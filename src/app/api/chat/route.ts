import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimiter";
import { embedText } from "@/lib/embedText";
import { rerankChunks } from "@/lib/rerank";
import { isValidUUID } from "@/lib/uuid-validation";
import { generateUUID } from "@/lib/utils/uuid";
import { xraySubsegment } from "@/lib/xray";
import { Metrics } from "@/lib/metrics";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import sql from "@/database/pgsql.js";
import logger from "@/lib/logger";
import { getLlmMaxTokens, getLlmTimeoutMs } from "@/lib/ai-config";
import { extractProviderText } from "@/lib/chat/llm-stream";
import { parseSseBlocks, toSseEvent } from "@/lib/chat/sse";
import { getTraceId } from "@/lib/trace";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface SearchResult {
  note_id: string;
  title: string;
  chunk_text: string;
  distance: number;
}

// cosine distance threshold — chunks further than this are considered irrelevant
// Cohere multilingual-v3.0 distances: 0 = identical, ~0.3 = very similar, ~0.7 = weakly related
const MAX_DISTANCE = 0.75;

// search chunks+embeddings tables, joining back to notes for metadata
async function semanticSearch(
  userId: string,
  queryVector: number[],
  noteId?: string,
  limit = 8,
): Promise<SearchResult[]> {
  const vectorStr = `[${queryVector.join(",")}]`;

  const globalSlots = noteId ? Math.max(limit - 6, 2) : limit;

  if (noteId) {
    // semantic search within pinned note + global search for cross-note context
    const [pinned, global] = await Promise.all([
      sql`
                SELECT n.note_id, n.title, c.text AS chunk_text,
                       (e.embedding <=> ${vectorStr}::vector) AS distance
                FROM app.embeddings e
                JOIN app.chunks c ON c.id = e.chunk_id
                JOIN app.notes n ON n.note_id = c.document_id
                WHERE c.user_id = ${userId}::uuid
                  AND c.document_id = ${noteId}::uuid
                  AND (e.embedding <=> ${vectorStr}::vector) < ${MAX_DISTANCE}
                ORDER BY e.embedding <=> ${vectorStr}::vector
                LIMIT 6
            `,
      sql`
                SELECT n.note_id, n.title, c.text AS chunk_text,
                       (e.embedding <=> ${vectorStr}::vector) AS distance
                FROM app.embeddings e
                JOIN app.chunks c ON c.id = e.chunk_id
                JOIN app.notes n ON n.note_id = c.document_id
                WHERE c.user_id = ${userId}::uuid
                  AND c.document_id != ${noteId}::uuid
                  AND (e.embedding <=> ${vectorStr}::vector) < ${MAX_DISTANCE}
                ORDER BY e.embedding <=> ${vectorStr}::vector
                LIMIT ${globalSlots}
            `,
    ]);
    return [...pinned, ...global] as SearchResult[];
  }

  const rows = await sql`
        SELECT n.note_id, n.title, c.text AS chunk_text,
               (e.embedding <=> ${vectorStr}::vector) AS distance
        FROM app.embeddings e
        JOIN app.chunks c ON c.id = e.chunk_id
        JOIN app.notes n ON n.note_id = c.document_id
        WHERE c.user_id = ${userId}::uuid
          AND (e.embedding <=> ${vectorStr}::vector) < ${MAX_DISTANCE}
        ORDER BY e.embedding <=> ${vectorStr}::vector
        LIMIT ${limit}
    `;
  return rows as SearchResult[];
}

function buildSystemPrompt(results: SearchResult[]): string {
  if (results.length === 0) {
    return "You are a helpful study assistant. No relevant notes were found for this question, but you can still help using your general knowledge. Let the user know you didn't find matching notes, then answer as best you can. Be friendly and concise.";
  }

  // group chunks by note for cleaner context
  const byNote = new Map<string, { title: string; chunks: string[] }>();
  for (const r of results) {
    const key = r.note_id;
    if (!byNote.has(key))
      byNote.set(key, { title: r.title || "Untitled", chunks: [] });
    byNote.get(key)!.chunks.push(r.chunk_text);
  }

  const blocks = [...byNote.entries()].map(([, { title, chunks }], i) => {
    const body = chunks.join("\n").slice(0, 1200).replace(/\s+/g, " ").trim();
    return `--- Note ${i + 1}: "${title}" ---\n${body}`;
  });

  return `You are a helpful study assistant with access to the user's notes.
The notes below show what the user is currently studying. Use them as helpful context — cite which note your answer draws from when relevant — but you are not limited to them. Feel free to supplement with your broader knowledge, explain concepts in more depth, or reference up-to-date information the notes may not cover.
If you go beyond the notes, briefly mention that you're drawing on general knowledge so the user knows.

NOTES CONTEXT:
${blocks.join("\n\n")}`;
}

async function callLLM(
  systemPrompt: string,
  history: ChatMessage[],
  userMessage: string,
): Promise<string> {
  const apiUrl = process.env.LLM_API_URL;
  const model = process.env.LLM_MODEL || "kimi-k2.5";
  const apiKey = process.env.LLM_API_KEY;
  const timeoutMs = getLlmTimeoutMs();
  const maxTokens = getLlmMaxTokens();
  if (!apiUrl) throw new Error("LLM_API_URL not configured");
  if (!apiKey) throw new Error("LLM_API_KEY not configured");

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...history.slice(-8),
    { role: "user", content: userMessage },
  ];

  // LLM_THINKING=off disables Kimi K2.5 chain-of-thought (saves tokens during dev)
  const thinking =
    process.env.LLM_THINKING === "off"
      ? { type: "disabled" as const }
      : undefined;

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens,
  };
  if (thinking) body.thinking = thinking;

  const res = await fetch(`${apiUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM API error (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function* callLLMStream(
  systemPrompt: string,
  history: ChatMessage[],
  userMessage: string,
): AsyncGenerator<string, void, unknown> {
  const apiUrl = process.env.LLM_API_URL;
  const model = process.env.LLM_MODEL || "kimi-k2.5";
  const apiKey = process.env.LLM_API_KEY;
  const timeoutMs = getLlmTimeoutMs();
  const maxTokens = getLlmMaxTokens();
  if (!apiUrl) throw new Error("LLM_API_URL not configured");
  if (!apiKey) throw new Error("LLM_API_KEY not configured");

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...history.slice(-8),
    { role: "user", content: userMessage },
  ];

  const thinking =
    process.env.LLM_THINKING === "off"
      ? { type: "disabled" as const }
      : undefined;

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens,
    stream: true,
  };
  if (thinking) body.thinking = thinking;

  const res = await fetch(`${apiUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM API error (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.body) {
    throw new Error("LLM stream body missing");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const state = { buffer: "" };

  while (true) {
    const { value, done } = await reader.read();
    const chunk = done
      ? decoder.decode()
      : decoder.decode(value, { stream: true });
    if (chunk) {
      for (const frame of parseSseBlocks(chunk, state)) {
        if (frame.data === "[DONE]") return;
        try {
          const payload = JSON.parse(frame.data);
          const text = extractProviderText(payload);
          if (text) yield text;
        } catch {
          // ignore malformed or non-json chunks
        }
      }
    }
    if (done) return;
  }
}

async function persistMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  sources?: { id: string; title: string }[],
): Promise<void> {
  const messageId = generateUUID();
  await sql`
        INSERT INTO app.chat_messages(id, session_id, role, content, sources)
        VALUES(${messageId}::uuid, ${sessionId}::uuid, ${role}, ${content}, ${sources ? JSON.stringify(sources) : null})
    `;
}

// create a new session or verify an existing one belongs to the user
async function resolveSession(
  userId: string,
  requestedSessionId: string | undefined,
  noteId: string | undefined,
  messageTitle: string,
): Promise<string> {
  if (requestedSessionId && isValidUUID(requestedSessionId)) {
    const rows = await sql`
            SELECT id FROM app.chat_sessions
            WHERE id = ${requestedSessionId}::uuid AND user_id = ${userId}::uuid
        `;
    if (rows.length > 0) {
      await sql`UPDATE app.chat_sessions SET updated_at = NOW() WHERE id = ${requestedSessionId}::uuid`;
      return requestedSessionId;
    }
  }

  const noteIdValue = noteId && isValidUUID(noteId) ? noteId : null;
  const title = messageTitle.slice(0, 60);
  const sessionId = generateUUID();
  await sql`
        INSERT INTO app.chat_sessions(id, user_id, note_id, title)
        VALUES(${sessionId}::uuid, ${userId}::uuid, ${noteIdValue}, ${title})
    `;
  void Metrics.chatSessionCreated();
  return sessionId;
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  const user = await validateSession();
  if (!user) {
    return tracedError("Unauthorized", 401);
  }

  const userId = (user as { user_id: string }).user_id;
  const limited = await checkRateLimit("chat", userId);
  if (limited) return limited;

  const body = await request.json();
  const {
    message,
    noteId,
    sessionId: requestedSessionId,
    history: requestHistory = [],
    stream = false,
  }: {
    message: string;
    noteId?: string;
    sessionId?: string;
    history?: ChatMessage[];
    stream?: boolean;
  } = body;

  if (!message?.trim()) {
    return tracedError("message is required", 400);
  }
  if (message.length > 2000) {
    return tracedError("message too long (max 2000 characters)", 400);
  }

  // sanitize noteId before it reaches any SQL queries
  const validNoteId = noteId && isValidUUID(noteId) ? noteId : undefined;

  const sessionId = await resolveSession(
    userId,
    requestedSessionId,
    validNoteId,
    message,
  );

  // load history from DB when continuing a session; fall back to request history
  let history: ChatMessage[] = requestHistory;
  if (requestedSessionId && isValidUUID(requestedSessionId)) {
    const dbMessages = await sql`
            SELECT role, content FROM app.chat_messages
            WHERE session_id = ${sessionId}::uuid
            ORDER BY created_at
            LIMIT 20
        `;
    history = dbMessages.map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
  }

  // persist user message immediately
  await persistMessage(sessionId, "user", message);

  let searchResults: SearchResult[] = [];
  let embeddingAvailable = false;
  let ragFailed = false;

  await xraySubsegment("rag-pipeline", async () => {
    const queryVector = await embedText(message);
    embeddingAvailable = true;
    // fetch 20 candidates, rerank to top 5
    const candidates = await semanticSearch(
      userId,
      queryVector,
      validNoteId,
      20,
    );
    const chunkTexts = candidates.map((r) => r.chunk_text);
    const reranked = await rerankChunks(message, chunkTexts);
    // map reranked results back using text index to avoid duplicate-text collisions
    const keptIndices = new Set(
      reranked.map((r) => chunkTexts.indexOf(r.text)).filter((i) => i !== -1),
    );
    searchResults = candidates.filter((_, i) => keptIndices.has(i));
  }).catch((err) => {
    const detail = err instanceof Error ? err.message : String(err);
    logger.warn("RAG pipeline failed, proceeding without context", {
      error: detail,
    });
    ragFailed = true;
  });

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
              )) {
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
                model: process.env.LLM_MODEL,
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

  if (!process.env.LLM_API_URL) {
    const reply = fallbackReply;

    await persistMessage(sessionId, "assistant", reply, uniqueSources);
    return NextResponse.json({
      reply,
      sources: uniqueSources,
      llmAvailable: false,
      sessionId,
    });
  }

  try {
    const t0 = Date.now();
    const reply = await xraySubsegment("llm-call", () =>
      callLLM(systemPrompt, history, message),
    );
    void Metrics.llmLatency(Date.now() - t0);

    await persistMessage(sessionId, "assistant", reply, uniqueSources);
    return NextResponse.json({
      reply,
      sources: uniqueSources,
      llmAvailable: true,
      ragAvailable: !ragFailed,
      sessionId,
    });
  } catch (error) {
    void Metrics.llmError();
    const detail = error instanceof Error ? error.message : String(error);
    logger.error("LLM call failed", {
      error: detail,
      model: process.env.LLM_MODEL,
    });
    return tracedError("Failed to generate response", 502);
  }
});
