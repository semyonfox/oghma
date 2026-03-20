/*
 * RAG Pipeline
 * Orchestrates the full retrieval-augmented generation flow
 * 1. Embed the user prompt into a vector
 * 2. Search pgvector for the 20 most semantically similar chunks
 * 3. Construct an augmented prompt with retrieved context
 * 4. Call the LLM and return the response
 */

import { embedText } from './embedText'
import sql from './database/pgsql.js';

const LLM_URL = process.env.LLM_API_URL;
const LLM_MODEL = process.env.LLM_MODEL;

import { rerankChunks } from './rerank';
export async function runRAGPipeline(userPrompt: string, userId: string): Promise<string> {
    const vector = await embedQuery(userPrompt);
    const candidates = await searchChunks(vector, userId);  // returns top 20
    const chunks = await rerankChunks(userPrompt, candidates);  // narrows to top 3
    const prompt = buildPrompt(userPrompt, chunks);
    const response = await callLLM(prompt);
    return response;
}

async function embedQuery(userPrompt: string): Promise<number[]> {
    return await embedText(userPrompt);
}

async function searchChunks(vector: number[], userId: string): Promise<string[]> {
    const results = await sql`
        SELECT c.text, c.page_number, c.section
        FROM app.embeddings e
                 JOIN app.chunks c ON c.id = e.chunk_id
        WHERE c.user_id = ${userId}
        ORDER BY e.embedding <=> ${JSON.stringify(vector)}::vector
            LIMIT 20
    `;

    return results.map((row: any) => row.text);
}

function buildPrompt(userPrompt: string, chunks: string[]): string {
    const context = chunks.join('\n\n');
    return `You are a helpful assistant. Use the context below to answer the question.

Context:
${context}

Question: ${userPrompt}`;
}

async function callLLM(prompt: string): Promise<string> {
       const res = await fetch(`${LLM_URL}/api/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.LLM_API_KEY}`
        },
        body: JSON.stringify({
            model: LLM_MODEL,
            messages: [{ role: 'user', content: prompt }]
        })
    });

    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
}