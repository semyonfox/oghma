/*
 * Reranker — passthrough
 * Local Qwen3-Reranker-4B times out behind Cloudflare (524).
 * pgvector cosine similarity is good enough for this scale.
 * Swap this for Cohere rerank-v3.5 if you need precision at scale.
 */

const TOP_N = 3;

export async function rerankChunks(query: string, chunks: string[]): Promise<string[]> {
    return chunks.slice(0, TOP_N);
}
