// embeds a single query via Cohere for semantic search
// uses input_type=search_query (asymmetric to search_document used at index time)

import { Metrics } from '@/lib/metrics';

const COHERE_URL = 'https://api.cohere.com/v2/embed';
const COHERE_MODEL = 'embed-multilingual-v3.0';

export async function embedText(text: string): Promise<number[]> {
    const apiKey = process.env.COHERE_API_KEY;
    if (!apiKey) throw new Error('COHERE_API_KEY not configured');

    const res = await fetch(COHERE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
            texts: [text],
            model: COHERE_MODEL,
            input_type: 'search_query',
            embedding_types: ['float'],
        }),
    });

    if (!res.ok) {
        const body = await res.text();
        void Metrics.cohereError('embed');
        throw new Error(`Cohere embed failed (${res.status}): ${body.slice(0, 200)}`);
    }

    const json = await res.json();
    const vectors: number[][] = json.embeddings?.float ?? [];
    if (vectors.length === 0) throw new Error('Cohere returned no embeddings');
    return vectors[0];
}
