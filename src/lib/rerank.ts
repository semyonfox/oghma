/*
 * Cross-encoder Reranker
 * Takes the user query and a list of candidate chunks from vector search
 * Sends them to Cohere Rerank for precise relevance scoring
 * Returns the top 3 most relevant chunks
 */

const COHERE_API_KEY = process.env.COHERE_API_KEY;

export async function rerankChunks(query: string, chunks: string[]): Promise<string[]> {
    const res = await fetch('https://api.cohere.com/v2/rerank', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${COHERE_API_KEY}`
        },
        body: JSON.stringify({
            model: 'rerank-v3.5',
            query: query,
            documents: chunks,
            top_n: 3
        })
    });

    const data = await res.json();
    return data.results.map((result: any) => chunks[result.index]);
}