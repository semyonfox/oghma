// self-hosted embeddings via open-webui/ollama on your server
// falls back to Cohere if not configured

export interface EmbeddingProvider {
  name: string;
  embedBatch(texts: string[]): Promise<number[][]>;
  embedSingle(text: string): Promise<number[]>;
  isConfigured(): boolean;
}

class SelfHostedEmbeddingProvider implements EmbeddingProvider {
  name = "self-hosted";
  private apiUrl: string;
  private apiKey: string;
  private model: string;

  constructor(apiUrl?: string, apiKey?: string, model?: string) {
    this.apiUrl = apiUrl || process.env.EMBEDDING_API_URL || "";
    this.apiKey = apiKey || process.env.EMBEDDING_API_KEY || "";
    this.model =
      model || process.env.EMBEDDING_MODEL || "mxbai-embed-large:latest";
  }

  isConfigured(): boolean {
    return !!this.apiUrl && !!this.apiKey;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.isConfigured()) {
      throw new Error("Self-hosted embeddings not configured");
    }

    const nonEmpty = texts.filter((t) => t?.trim());
    if (nonEmpty.length === 0) return [];

    // try multiple endpoint formats supported by open-webui
    const endpoints = [
      `${this.apiUrl}/api/embeddings`,
      `${this.apiUrl}/v1/embeddings`,
      `${this.apiUrl}/ollama/api/embed`,
    ];

    let lastError: Error | null = null;

    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            input: nonEmpty,
            model: this.model,
          }),
          signal: AbortSignal.timeout(30000),
        });

        if (!res.ok) {
          const text = await res.text();
          console.debug(
            `${endpoint} returned ${res.status}: ${text.slice(0, 100)}`,
          );
          lastError = new Error(`${endpoint} ${res.status}`);
          continue;
        }

        const json = await res.json();

        // handle different response formats
        let embeddings: number[][] = [];

        if (json.data && Array.isArray(json.data)) {
          // OpenAI-compatible format: {data: [{embedding: [...]}]}
          embeddings = json.data
            .map((item: { embedding: number[] }) => item.embedding)
            .filter(Boolean);
        } else if (json.embeddings && Array.isArray(json.embeddings)) {
          // ollama format: {embeddings: [[...]]}
          embeddings = json.embeddings;
        } else if (Array.isArray(json)) {
          // direct array format
          embeddings = json;
        }

        if (embeddings.length === nonEmpty.length) {
          return embeddings;
        }

        console.warn(
          `${endpoint} returned ${embeddings.length} embeddings, expected ${nonEmpty.length}`,
        );
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.debug(`${endpoint} failed: ${lastError.message}`);
      }
    }

    throw lastError || new Error("All self-hosted embedding endpoints failed");
  }

  async embedSingle(text: string): Promise<number[]> {
    const [embedding] = await this.embedBatch([text]);
    if (!embedding) {
      throw new Error("Failed to embed single text");
    }
    return embedding;
  }
}

export function createEmbeddingProvider(
  apiUrl?: string,
  apiKey?: string,
  model?: string,
): EmbeddingProvider {
  return new SelfHostedEmbeddingProvider(apiUrl, apiKey, model);
}

export const defaultEmbeddingProvider = new SelfHostedEmbeddingProvider();
