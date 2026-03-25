import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimiter';
import { embedText } from '@/lib/embedText';
import { rerankChunks } from '@/lib/rerank';
import { isValidUUID } from '@/lib/uuid-validation';
import { xraySubsegment } from '@/lib/xray';
import { Metrics } from '@/lib/metrics';
import { withErrorHandler, tracedError } from '@/lib/api-error';
import sql from '@/database/pgsql.js';
import logger from '@/lib/logger';

interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

interface SearchResult {
    note_id: string;
    title: string;
    chunk_text: string;
    distance: number;
}

// search chunks+embeddings tables, joining back to notes for metadata
async function semanticSearch(
    userId: string,
    queryVector: number[],
    noteId?: string,
    limit = 8
): Promise<SearchResult[]> {
    const vectorStr = `[${queryVector.join(',')}]`;

    if (noteId) {
        // pinned note chunks first, then fill from global search
        const [pinned, similar] = await Promise.all([
            sql`
                SELECT n.note_id, n.title, c.text AS chunk_text, 0::float AS distance
                FROM app.chunks c
                JOIN app.notes n ON n.note_id = c.document_id
                WHERE c.user_id = ${userId}::uuid
                  AND c.document_id = ${noteId}::uuid
                ORDER BY c.created_at
                LIMIT 4
            `,
            sql`
                SELECT n.note_id, n.title, c.text AS chunk_text,
                       (e.embedding <=> ${vectorStr}::vector) AS distance
                FROM app.embeddings e
                JOIN app.chunks c ON c.id = e.chunk_id
                JOIN app.notes n ON n.note_id = c.document_id
                WHERE c.user_id = ${userId}::uuid
                  AND c.document_id != ${noteId}::uuid
                ORDER BY e.embedding <=> ${vectorStr}::vector
                LIMIT ${limit - 4}
            `,
        ]);
        return [...pinned, ...similar] as SearchResult[];
    }

    const rows = await sql`
        SELECT n.note_id, n.title, c.text AS chunk_text,
               (e.embedding <=> ${vectorStr}::vector) AS distance
        FROM app.embeddings e
        JOIN app.chunks c ON c.id = e.chunk_id
        JOIN app.notes n ON n.note_id = c.document_id
        WHERE c.user_id = ${userId}::uuid
        ORDER BY e.embedding <=> ${vectorStr}::vector
        LIMIT ${limit}
    `;
    return rows as SearchResult[];
}

function buildSystemPrompt(results: SearchResult[]): string {
    if (results.length === 0) {
        return 'You are a helpful study assistant. The user has no notes with embeddings yet — let them know they can upload PDFs to start building a searchable knowledge base. Be friendly and concise.';
    }

    // group chunks by note for cleaner context
    const byNote = new Map<string, { title: string; chunks: string[] }>();
    for (const r of results) {
        const key = r.note_id;
        if (!byNote.has(key)) byNote.set(key, { title: r.title || 'Untitled', chunks: [] });
        byNote.get(key)!.chunks.push(r.chunk_text);
    }

    const blocks = [...byNote.entries()].map(([, { title, chunks }], i) => {
        const body = chunks.join('\n').slice(0, 1200).replace(/\s+/g, ' ').trim();
        return `--- Note ${i + 1}: "${title}" ---\n${body}`;
    });

    return `You are a helpful study assistant with access to the user's notes.
Use ONLY the context below to answer questions. If the answer isn't in the context, say so clearly rather than making something up.
Cite which note your answer comes from when relevant.

CONTEXT:
${blocks.join('\n\n')}`;
}

async function callLLM(
    systemPrompt: string,
    history: ChatMessage[],
    userMessage: string
): Promise<string> {
    const apiUrl = process.env.LLM_API_URL;
    const model = process.env.LLM_MODEL || 'kimi-k2.5';
    const apiKey = process.env.LLM_API_KEY;
    if (!apiUrl) throw new Error('LLM_API_URL not configured');
    if (!apiKey) throw new Error('LLM_API_KEY not configured');

    const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-8),
        { role: 'user', content: userMessage },
    ];

    // LLM_THINKING=off disables Kimi K2.5 chain-of-thought (saves tokens during dev)
    const thinking = process.env.LLM_THINKING === 'off'
        ? { type: 'disabled' as const }
        : undefined;

    const body: Record<string, unknown> = { model, messages, max_tokens: 16384 };
    if (thinking) body.thinking = thinking;

    const res = await fetch(`${apiUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`LLM API error (${res.status}): ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
}

async function persistMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
    sources?: { id: string; title: string }[],
): Promise<void> {
    await sql`
        INSERT INTO app.chat_messages(session_id, role, content, sources)
        VALUES(${sessionId}::uuid, ${role}, ${content}, ${sources ? JSON.stringify(sources) : null})
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
    const [row] = await sql`
        INSERT INTO app.chat_sessions(user_id, note_id, title)
        VALUES(${userId}::uuid, ${noteIdValue}, ${title})
        RETURNING id
    `;
    void Metrics.chatSessionCreated();
    return row.id as string;
}

export const POST = withErrorHandler(async (request: NextRequest) => {
    const user = await validateSession();
    if (!user) {
        return tracedError('Unauthorized', 401);
    }

    const userId = (user as { user_id: string }).user_id;
    const limited = await checkRateLimit('chat', userId);
    if (limited) return limited;

    const body = await request.json();
    const {
        message,
        noteId,
        sessionId: requestedSessionId,
        history: requestHistory = [],
    }: { message: string; noteId?: string; sessionId?: string; history?: ChatMessage[] } = body;

    if (!message?.trim()) {
        return tracedError('message is required', 400);
    }
    if (message.length > 2000) {
        return tracedError('message too long (max 2000 characters)', 400);
    }

    const sessionId = await resolveSession(userId, requestedSessionId, noteId, message);

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
            role: m.role as 'user' | 'assistant',
            content: m.content,
        }));
    }

    // persist user message immediately
    await persistMessage(sessionId, 'user', message);

    let searchResults: SearchResult[] = [];
    let embeddingAvailable = false;

    await xraySubsegment('rag-pipeline', async () => {
        const queryVector = await embedText(message);
        embeddingAvailable = true;
        // fetch 20 candidates, rerank to top 5
        const candidates = await semanticSearch(userId, queryVector, noteId, 20);
        const reranked = await rerankChunks(
            message,
            candidates.map(r => r.chunk_text),
        );
        // map reranked text back to full SearchResult objects
        const rerankedTexts = new Set(reranked.map(r => r.text));
        searchResults = candidates.filter(r => rerankedTexts.has(r.chunk_text));
    }).catch(() => {
        // embedding/rerank unavailable — fall through to LLM without context
    });

    const systemPrompt = buildSystemPrompt(searchResults);
    const uniqueSources = [...new Set(searchResults.map(r => r.note_id))].map(id => {
        const r = searchResults.find(s => s.note_id === id)!;
        return { id: r.note_id, title: r.title };
    });

    if (!process.env.LLM_API_URL) {
        const reply = searchResults.length > 0
            ? `Found ${searchResults.length} relevant chunk(s) from: ${[...new Set(searchResults.map(r => `"${r.title || 'Untitled'}"`))].join(', ')}. Connect an LLM (set LLM_API_URL) to get AI-generated answers.`
            : embeddingAvailable
                ? 'No relevant notes found. Try uploading a PDF to build your knowledge base.'
                : 'Embedding service unavailable. Set COHERE_API_KEY to enable semantic search.';

        await persistMessage(sessionId, 'assistant', reply, uniqueSources);
        return NextResponse.json({ reply, sources: uniqueSources, llmAvailable: false, sessionId });
    }

    try {
        const t0 = Date.now();
        const reply = await xraySubsegment('llm-call', () => callLLM(systemPrompt, history, message));
        void Metrics.llmLatency(Date.now() - t0);

        await persistMessage(sessionId, 'assistant', reply, uniqueSources);
        return NextResponse.json({ reply, sources: uniqueSources, llmAvailable: true, sessionId });
    } catch (error) {
        void Metrics.llmError();
        const detail = error instanceof Error ? error.message : String(error);
        logger.error('LLM call failed', { error: detail, model: process.env.LLM_MODEL });
        return tracedError('Failed to generate response', 502);
    }
});
