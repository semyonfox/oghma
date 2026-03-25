// batch-embeds chunks via Cohere embed API v2
// uses embed-multilingual-v3.0 (1024 dims) with asymmetric input_type for better retrieval

const COHERE_URL = 'https://api.cohere.com/v2/embed';
const COHERE_MODEL = 'embed-multilingual-v3.0';
const BATCH_SIZE = 96; // Cohere allows up to 96 texts per request

function buildRequest(apiKey: string, batch: string[]) {
    return {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
            texts: batch,
            model: COHERE_MODEL,
            input_type: 'search_document',
            embedding_types: ['float'],
        }),
    };
}

export async function embedChunks(
    chunks: string[],
): Promise<{ chunk: string; vector: number[] }[]> {
    const apiKey = process.env.COHERE_API_KEY;
    if (!apiKey) throw new Error('COHERE_API_KEY not configured');

    const nonEmpty = chunks.filter(c => c?.trim());
    if (nonEmpty.length === 0) return [];

    const results: { chunk: string; vector: number[] }[] = [];

    for (let i = 0; i < nonEmpty.length; i += BATCH_SIZE) {
        const batch = nonEmpty.slice(i, i + BATCH_SIZE);
        try {
            const res = await fetch(COHERE_URL, buildRequest(apiKey, batch));
            if (!res.ok) {
                console.warn(`Cohere embed failed (${res.status}), skipping ${batch.length} chunks`);
                continue;
            }
            const json = await res.json();
            const vectors: number[][] = json.embeddings?.float ?? [];
            for (let j = 0; j < vectors.length && j < batch.length; j++) {
                results.push({ chunk: batch[j], vector: vectors[j] });
            }
        } catch (err) {
            console.warn(`Cohere embed error: ${err instanceof Error ? err.message : err}`);
        }
    }

    return results;
}
