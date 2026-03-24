/*
 * RAG Pipeline
 * 1. Embed the user prompt into a vector
 * 2. Search pgvector for the 20 most semantically similar chunks
 * 3. Rerank to top 3 via batch LLM call
 * 4. Call the LLM and return the response
 */

import { embedText } from './embedText';
import { rerankChunks } from './rerank';
import { getOpenWebUIToken, invalidateToken } from './openwebuiAuth';
import sql from '@/database/pgsql.js';

const LLM_URL = process.env.LLM_API_URL;
const LLM_MODEL = process.env.LLM_MODEL;

export async function runRAGPipeline(userPrompt: string, userId: string): Promise<string> {
    const vector = await embedText(userPrompt);
    const candidates = await searchChunks(vector, userId);
    const chunks = await rerankChunks(userPrompt, candidates);
    return callLLM(buildPrompt(userPrompt, chunks));
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

function buildPrompt(userPrompt: string, chunks: string[]): string {
    return `You are a helpful assistant. Use the context below to answer the question.

Context:
${chunks.join('\n\n')}

Question: ${userPrompt}`;
}

async function callLLM(prompt: string): Promise<string> {
    const token = await getOpenWebUIToken();
    const res = await fetch(`${LLM_URL}/api/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ model: LLM_MODEL, messages: [{ role: 'user', content: prompt }] }),
    });

    if (res.status === 401) { invalidateToken(); throw new Error('Token expired'); }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
}
