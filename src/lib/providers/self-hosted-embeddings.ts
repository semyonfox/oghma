// embedding provider — calls any OpenAI-compatible endpoint (SiliconFlow, ollama, etc.)
// configured via EMBEDDING_API_URL, EMBEDDING_API_KEY, EMBEDDING_MODEL

export interface EmbeddingProvider {
  name: string;
  embedBatch(texts: string[]): Promise<number[][]>;
  embedSingle(text: string): Promise<number[]>;
  isConfigured(): boolean;
}

// reads env vars at call time so tests can set them after import
function env() {
  return {
    apiUrl: process.env.EMBEDDING_API_URL || "",
    apiKey: process.env.EMBEDDING_API_KEY || "",
    model: process.env.EMBEDDING_MODEL || "",
  };
}

class SelfHostedEmbeddingProvider implements EmbeddingProvider {
  name = "self-hosted";

  isConfigured(): boolean {
    const { apiUrl, apiKey, model } = env();
    return !!(apiUrl && apiKey && model);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const { apiUrl, apiKey, model } = env();
    if (!(apiUrl && apiKey && model)) {
      throw new Error("Embedding provider not configured (EMBEDDING_API_URL/KEY/MODEL)");
    }

    const res = await fetch(`${apiUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ input: texts, model }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Embedding API ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = await res.json();
    const embeddings: number[][] = (json.data ?? [])
      .map((item: { embedding: number[] }) => item.embedding)
      .filter(Boolean);

    if (embeddings.length !== texts.length) {
      throw new Error(
        `Embedding count mismatch: got ${embeddings.length}, expected ${texts.length}`,
      );
    }

    return embeddings;
  }

  async embedSingle(text: string): Promise<number[]> {
    const [embedding] = await this.embedBatch([text]);
    if (!embedding) throw new Error("Failed to embed single text");
    return embedding;
  }
}

export const defaultEmbeddingProvider = new SelfHostedEmbeddingProvider();
