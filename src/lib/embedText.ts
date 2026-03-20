// Core function that calls the embedding model
const EMBEDDING_URL = process.env.EMBEDDING_API_URL;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL;

export async function embedText(text: string): Promise<number[]> {
    const res = await fetch(`${EMBEDDING_URL}/api/embeddings`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.LLM_API_KEY}`
        },
        body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: text
        }),
    });

    // OpenWebUI returns OpenAI-compatible format: { data: [{ embedding: [...] }] }
    const data = await res.json();
    return data.data?.[0]?.embedding ?? data.embedding;
}