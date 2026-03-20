// fetches request to embedding server for each chunk, concurrently
// server converts to vector; failed chunks are filtered out rather than returning null vectors

export async function embedChunks(chunks: string[]): Promise<{ chunk: string, vector: number[] }[]> {
    // read lazily so tests can set the env var before calling
    const EMBEDDING_URL = process.env.EMBEDDING_API_URL;

    if (!EMBEDDING_URL) {
        throw new Error(
            'Embedding API URL not configured. Set EMBEDDING_API_URL environment variable to enable document embedding.'
        );
    }

    // filter out empty/whitespace chunks before sending
    const nonEmptyChunks = chunks.filter(chunk => chunk && chunk.trim().length > 0);

    if (nonEmptyChunks.length === 0) {
        return [];
    }

    try {
        const results = await Promise.all(
            nonEmptyChunks.map(async (chunk): Promise<{ chunk: string; vector: number[] } | null> => {
                try {
                    const res = await fetch(`${EMBEDDING_URL}/embed`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: chunk }),
                    });

                    if (!res.ok) {
                        console.warn(`Embedding failed for chunk (status ${res.status}), skipping`);
                        return null;
                    }

                    const data = await res.json();
                    const { vector } = data;

                    if (!vector || !Array.isArray(vector)) {
                        console.warn('Invalid embedding response format, skipping chunk');
                        return null;
                    }

                    return { chunk, vector: vector as number[] };
                } catch (chunkError) {
                    console.warn('Error embedding chunk:', chunkError);
                    return null;
                }
            })
        );

        // filter out chunks that failed to embed
        return results.filter((r): r is { chunk: string; vector: number[] } => r !== null);
    } catch (error) {
        throw new Error(`Failed to embed chunks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
