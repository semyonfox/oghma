/*
 * Chunk Embedder
 * Takes an array of text chunks and returns each paired with its embedding vector
 * Runs all embedding requests concurrently for performance
 * Used during ingestion to populate the embeddings table
 */

import { embedText } from './embedText';

export async function embedChunks(chunks: string[]): Promise<{ chunk: string, vector: number[] }[]> {
    const results = await Promise.all(
        chunks.map(async (chunk) => {
            const vector = await embedText(chunk);
            return { chunk, vector };
        })
    );
    return results;
}