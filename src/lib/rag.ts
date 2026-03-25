/*
 * RAG Pipeline
 * 1. Embed the user prompt into a vector
 * 2. Search pgvector for the 20 most semantically similar chunks
 * 3. Rerank to top 3 via batch LLM call
 * 4. Call the LLM and return the response
 */

import { embedText } from './embedText';
import { rerankChunks } from './rerank';
import sql from '@/database/pgsql.js';

const LLM_URL = process.env.LLM_API_URL;
const LLM_MODEL = process.env.LLM_MODEL;
const LLM_API_KEY = process.env.LLM_API_KEY;

export async function runRAGPipeline(userPrompt: string, userId: string): Promise<string> {
    const vector = await embedText(userPrompt);
    const candidates = await searchChunks(vector, userId);
    const ranked = await rerankChunks(userPrompt, candidates);
    return callLLM(buildMessages(userPrompt, ranked.map(r => r.text)));
}

async function searchChunks(vector: number[], userId: string): Promise<string[]> {
    const results = await sql`
        SELECT c.text
        FROM app.embeddings e
        JOIN app.chunks c ON c.id = e.chunk_id
        WHERE c.user_id = ${userId}::uuid
        ORDER BY e.embedding <=> ${JSON.stringify(vector)}::vector
        LIMIT 20
    `;
    return results.map((row: any) => row.text);
}

function buildMessages(userPrompt: string, chunks: string[]): Array<{ role: string; content: string }> {
    return [
        {
            role: 'system',
            content: `You are a helpful assistant. Use the context below to answer the question. If the context does not contain enough information, say so.\n\nContext:\n${chunks.join('\n\n')}`,
        },
        { role: 'user', content: userPrompt },
    ];
}

async function callLLM(messages: Array<{ role: string; content: string }>): Promise<string> {
    if (!LLM_API_KEY) throw new Error('LLM_API_KEY not configured');

    const res = await fetch(`${LLM_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LLM_API_KEY}` },
        body: JSON.stringify({ model: LLM_MODEL, messages }),
    });

    if (!res.ok) throw new Error(`LLM error (${res.status})`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
}
