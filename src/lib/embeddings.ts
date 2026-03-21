// batch-embeds chunks via OpenAI-compatible /api/v1/embeddings endpoint
// authenticates via shared OpenWebUI credentials (same as LLM)

import { getOpenWebUIToken, invalidateToken } from './openwebuiAuth';

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? 'qwen3-embedding:8b';
const BATCH_SIZE = 50;

export async function embedChunks(chunks: string[]): Promise<{ chunk: string, vector: number[] }[]> {
    const EMBEDDING_URL = process.env.EMBEDDING_API_URL;

    if (!EMBEDDING_URL) {
        throw new Error(
            'Embedding API URL not configured. Set EMBEDDING_API_URL environment variable to enable document embedding.'
        );
    }

    const nonEmptyChunks = chunks.filter(chunk => chunk && chunk.trim().length > 0);
    if (nonEmptyChunks.length === 0) return [];

    const results: { chunk: string; vector: number[] }[] = [];

    for (let i = 0; i < nonEmptyChunks.length; i += BATCH_SIZE) {
        const batch = nonEmptyChunks.slice(i, i + BATCH_SIZE);

        try {
            const token = await getOpenWebUIToken();
            const res = await fetch(`${EMBEDDING_URL}/api/v1/embeddings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ input: batch, model: EMBEDDING_MODEL }),
            });

            // re-auth on 401 and retry once
            if (res.status === 401) {
                invalidateToken();
                const freshToken = await getOpenWebUIToken();
                const retry = await fetch(`${EMBEDDING_URL}/api/v1/embeddings`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${freshToken}`,
                    },
                    body: JSON.stringify({ input: batch, model: EMBEDDING_MODEL }),
                });
                if (!retry.ok) {
                    console.warn(`Embedding batch failed after re-auth (status ${retry.status}), skipping ${batch.length} chunks`);
                    continue;
                }
                const json = await retry.json();
                appendEmbeddings(json.data, batch, results);
                continue;
            }

            if (!res.ok) {
                console.warn(`Embedding batch failed (status ${res.status}), skipping ${batch.length} chunks`);
                continue;
            }

            const json = await res.json();
            appendEmbeddings(json.data, batch, results);
        } catch (err) {
            console.warn(`Embedding batch error: ${err instanceof Error ? err.message : err}`);
        }
    }

    return results;
}

function appendEmbeddings(
    data: { embedding: number[]; index: number }[] | undefined,
    batch: string[],
    results: { chunk: string; vector: number[] }[],
) {
    if (!Array.isArray(data)) {
        console.warn('Unexpected embedding response format, skipping batch');
        return;
    }
    for (const item of data) {
        if (Array.isArray(item.embedding) && item.index < batch.length) {
            results.push({ chunk: batch[item.index], vector: item.embedding });
        }
    }
}
