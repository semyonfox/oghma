//TODO: implement correct APIS/URL body types for home server and database layout
//connect to database, store vector in separate lookup table with indexing & foreign key to link chunks to vectors

// fetches request to embedding server for each chunk, concurrently
// server converts to vector, returning vector paired with text chunks for mock indexing until db is set up
//
const EMBEDDING_URL = process.env.EMBEDDING_API_URL;

export async function embedChunks(chunks: string[]): Promise<{ chunk: string, vector: number[] }[]> {
    // Validate environment setup
    if (!EMBEDDING_URL) {
        throw new Error(
            'Embedding API URL not configured. Set EMBEDDING_API_URL environment variable to enable document embedding.'
        );
    }

    // Filter out empty chunks before embedding
    const nonEmptyChunks = chunks.filter(chunk => chunk && chunk.trim().length > 0);

    if (nonEmptyChunks.length === 0) {
        return [];
    }

    try {
        const results = await Promise.all(
            nonEmptyChunks.map(async (chunk) => {
                try {
                    const res = await fetch(`${EMBEDDING_URL}/embed`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: chunk }),
                    });

                    if (!res.ok) {
                        console.warn(`Embedding failed for chunk (status ${res.status}), using zero vector`);
                        return { chunk, vector: null };
                    }

                    const data = await res.json();
                    const { vector } = data;

                    if (!vector || !Array.isArray(vector)) {
                        console.warn('Invalid embedding response format, using zero vector');
                        return { chunk, vector: null };
                    }

                    return { chunk, vector };
                } catch (chunkError) {
                    console.warn('Error embedding chunk:', chunkError);
                    return { chunk, vector: null };
                }
            })
        );
        return results;
    } catch (error) {
        throw new Error(`Failed to embed chunks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}