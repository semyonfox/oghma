// Embeds text via OpenWebUI — auto-refreshes token on 401
import { getOpenWebUIToken, invalidateToken } from './openwebuiAuth';

const EMBEDDING_URL = process.env.EMBEDDING_API_URL;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL;

export async function embedText(text: string): Promise<number[]> {
    const token = await getOpenWebUIToken();
    const res = await fetch(`${EMBEDDING_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
    });

    if (res.status === 401) {
        invalidateToken();
        throw new Error('OpenWebUI token expired — will retry on next request');
    }

    // OpenWebUI returns OpenAI-compatible format: { data: [{ embedding: [...] }] }
    const data = await res.json();
    return data.data?.[0]?.embedding ?? data.embedding;
}
