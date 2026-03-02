//TODO: implement correct APIS/URL body types for home server and database layout
//connect to database, store vector in separate lookup table with indexing & foreign key to link chunks to vectors

// fetches request to embedding server for each chunk, concurrently
// server converts to vector, returning vector paired with text chunks for mock indexing until db is set up
//
const EMBEDDING_URL = process.env.EMBEDDING_API_URL;

export async function embedChunks(chunks: string[]): Promise<{ chunk: string, vector: number[] }[]> {
    const results = await Promise.all(
        chunks.map(async (chunk) => {
            const res = await fetch(`${EMBEDDING_URL}/embed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: chunk }),
            });
            const { vector } = await res.json();
            return { chunk, vector };
        })
    );
    return results;
}