import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { embedChunks } from '@/lib/embeddings';
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
    extracted_text: string | null;
    content: string;
    distance: number;
}

// retrieve the top-k most semantically similar notes for the user
async function semanticSearch(
    userId: string,
    queryVector: number[],
    noteId?: string,
    limit = 4
): Promise<SearchResult[]> {
    const vectorStr = `[${queryVector.join(',')}]`;

    if (noteId) {
        // pinned note first, then fill remaining slots from semantic search
        const [pinned, similar] = await Promise.all([
            sql`
                SELECT note_id, title, extracted_text, content
                FROM app.notes
                WHERE note_id = ${noteId}::uuid
                  AND user_id = ${userId}::uuid
                  AND deleted = 0
                LIMIT 1
            `,
            sql`
                SELECT note_id, title, extracted_text, content,
                       (embedding <=> ${vectorStr}::vector) AS distance
                FROM app.notes
                WHERE user_id = ${userId}::uuid
                  AND deleted = 0
                  AND embedding IS NOT NULL
                  AND note_id != ${noteId}::uuid
                ORDER BY embedding <=> ${vectorStr}::vector
                LIMIT ${limit - 1}
            `,
        ]);

        const pinnedWithDist = pinned.map((r: { note_id: string; title: string; extracted_text: string | null; content: string }) => ({
            ...r,
            distance: 0,
        }));
        return [...pinnedWithDist, ...similar] as SearchResult[];
    }

    const rows = await sql`
        SELECT note_id, title, extracted_text, content,
               (embedding <=> ${vectorStr}::vector) AS distance
        FROM app.notes
        WHERE user_id = ${userId}::uuid
          AND deleted = 0
          AND embedding IS NOT NULL
        ORDER BY embedding <=> ${vectorStr}::vector
        LIMIT ${limit}
    `;

    return rows as SearchResult[];
}

// build the system prompt with retrieved context
function buildSystemPrompt(results: SearchResult[]): string {
    if (results.length === 0) {
        return `You are a helpful study assistant. The user has no notes with embeddings yet — let them know they can upload PDFs to start building a searchable knowledge base. Be friendly and concise.`;
    }

    const contextBlocks = results.map((r, i) => {
        const body = r.extracted_text || r.content || '';
        const snippet = body.slice(0, 800).replace(/\s+/g, ' ').trim();
        return `--- Note ${i + 1}: "${r.title || 'Untitled'}" ---\n${snippet}`;
    });

    return `You are a helpful study assistant with access to the user's notes.
Use ONLY the context below to answer questions. If the answer isn't in the context, say so clearly rather than making something up.
Cite which note your answer comes from when relevant.

CONTEXT:
${contextBlocks.join('\n\n')}`;
}

// call an OpenAI-compatible LLM endpoint
async function callLLM(
    systemPrompt: string,
    history: ChatMessage[],
    userMessage: string
): Promise<string> {
    const apiUrl = process.env.LLM_API_URL;
    const model = process.env.LLM_MODEL || 'qwen3:8b';

    if (!apiUrl) {
        throw new Error('LLM_API_URL not configured');
    }

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

    const body = await request.json();
    const {
        message,
        noteId,
        history = [],
    }: { message: string; noteId?: string; history?: ChatMessage[] } = body;

    if (!message?.trim()) {
        return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const userId = (user as { user_id: string }).user_id;

    // embed the user query so we can do semantic search
    let searchResults: SearchResult[] = [];
    let embeddingAvailable = false;

    try {
        const embeddings = await embedChunks([message]);
        if (embeddings.length > 0) {
            embeddingAvailable = true;
            searchResults = await semanticSearch(userId, embeddings[0].vector, noteId);
        }
    } catch {
        // embedding server down — fall through to LLM without context
    }

    const systemPrompt = buildSystemPrompt(searchResults);

    // if no LLM is configured, return the retrieved context so the frontend
    // can show something useful even without an AI backend
    if (!process.env.LLM_API_URL) {
        const contextSummary = searchResults.length > 0
            ? `Found ${searchResults.length} relevant note(s): ${searchResults.map(r => `"${r.title || 'Untitled'}"`).join(', ')}. Connect an LLM (set LLM_API_URL) to get AI-generated answers.`
            : embeddingAvailable
                ? 'No relevant notes found. Try uploading a PDF to build your knowledge base.'
                : 'Embedding service unavailable. Set EMBEDDING_API_URL to enable semantic search.';

        return NextResponse.json({
            reply: contextSummary,
            sources: searchResults.map(r => ({ id: r.note_id, title: r.title })),
            llmAvailable: false,
        });
    }

    try {
        const reply = await callLLM(systemPrompt, history, message);

        return NextResponse.json({
            reply,
            sources: searchResults.map(r => ({ id: r.note_id, title: r.title })),
            llmAvailable: true,
        });
    } catch (error) {
        logger.error('LLM error', { error });
        return NextResponse.json(
            { error: 'Failed to generate response' },
            { status: 502 }
        );
    }
}
