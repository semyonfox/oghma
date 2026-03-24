import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimiter';
import { embedText } from '@/lib/embedText';
import { rerankChunks } from '@/lib/rerank';
import { getOpenWebUIToken, invalidateToken } from '@/lib/openwebuiAuth';
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
    const model = process.env.LLM_MODEL || 'qwen3:8b';
    if (!apiUrl) throw new Error('LLM_API_URL not configured');

    const token = await getOpenWebUIToken();
    const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-8),
        { role: 'user', content: userMessage },
    ];

    const res = await fetch(`${apiUrl}/api/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ model, messages, temperature: 0.4, max_tokens: 1024 }),
    });

    if (res.status === 401) { invalidateToken(); throw new Error('Token expired'); }
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`LLM API error (${res.status}): ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
}

export async function POST(request: NextRequest) {
    const user = await validateSession();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (user as { user_id: string }).user_id;
    const limited = await checkRateLimit('chat', userId);
    if (limited) return limited;

    const body = await request.json();
    const {
        message,
        noteId,
        history = [],
    }: { message: string; noteId?: string; history?: ChatMessage[] } = body;

    if (!message?.trim()) {
        return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }
    if (message.length > 2000) {
        return NextResponse.json({ error: 'message too long (max 2000 characters)' }, { status: 400 });
    }
    if (history.length > 20) {
        return NextResponse.json({ error: 'history too long (max 20 messages)' }, { status: 400 });
    }

    let searchResults: SearchResult[] = [];
    let embeddingAvailable = false;

    try {
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
    } catch {
        // embedding/rerank unavailable — fall through to LLM without context
    }

    const systemPrompt = buildSystemPrompt(searchResults);

    if (!process.env.LLM_API_URL) {
        const contextSummary = searchResults.length > 0
            ? `Found ${searchResults.length} relevant chunk(s) from: ${[...new Set(searchResults.map(r => `"${r.title || 'Untitled'}"`))].join(', ')}. Connect an LLM (set LLM_API_URL) to get AI-generated answers.`
            : embeddingAvailable
                ? 'No relevant notes found. Try uploading a PDF to build your knowledge base.'
                : 'Embedding service unavailable. Set COHERE_API_KEY to enable semantic search.';

        return NextResponse.json({
            reply: contextSummary,
            sources: [...new Set(searchResults.map(r => r.note_id))].map(id => {
                const r = searchResults.find(s => s.note_id === id)!;
                return { id: r.note_id, title: r.title };
            }),
            llmAvailable: false,
        });
    }

    try {
        const reply = await callLLM(systemPrompt, history, message);
        const uniqueSources = [...new Set(searchResults.map(r => r.note_id))].map(id => {
            const r = searchResults.find(s => s.note_id === id)!;
            return { id: r.note_id, title: r.title };
        });

        return NextResponse.json({ reply, sources: uniqueSources, llmAvailable: true });
    } catch (error) {
        logger.error('LLM error', { error });
        return NextResponse.json({ error: 'Failed to generate response' }, { status: 502 });
    }
}
