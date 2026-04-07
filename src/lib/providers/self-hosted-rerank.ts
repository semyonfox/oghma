// self-hosted reranking via open-webui/ollama
// optional — falls back gracefully if not available

export interface RerankProvider {
  name: string;
  rerank(
    query: string,
    chunks: string[],
    topN: number,
  ): Promise<Array<{ index: number; text: string; score: number }>>;
  isConfigured(): boolean;
}

class SelfHostedRerankProvider implements RerankProvider {
  name = "self-hosted";
  private apiUrl: string;
  private apiKey: string;
  private model: string = "dengcao/Qwen3-Reranker-4B:Q4_K_M";

  constructor(apiUrl?: string, apiKey?: string) {
    this.apiUrl = apiUrl || process.env.EMBEDDING_API_URL || "";
    this.apiKey = apiKey || process.env.EMBEDDING_API_KEY || "";
  }

  isConfigured(): boolean {
    return !!this.apiUrl && !!this.apiKey;
  }

  async rerank(
    query: string,
    chunks: string[],
    topN: number,
  ): Promise<Array<{ index: number; text: string; score: number }>> {
    if (!this.isConfigured()) {
      throw new Error("Self-hosted rerank not configured");
    }

    if (chunks.length <= topN) {
      return chunks.map((text, index) => ({ index, text, score: 1 }));
    }

    // try endpoints that might support reranking
    const endpoints = [`${this.apiUrl}/api/rerank`, `${this.apiUrl}/v1/rerank`];

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
            model: this.model,
            query,
            documents: chunks.map((text) => ({ text })),
            top_n: topN,
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
        const results: Array<{ index: number; relevance_score?: number }> =
          json.results ?? [];

        if (!Array.isArray(results) || results.length === 0) {
          lastError = new Error(`${endpoint} returned empty results`);
          continue;
        }

        return results.map((r) => ({
          index: r.index,
          text: chunks[r.index],
          score: r.relevance_score ?? 0.5,
        }));
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.debug(`${endpoint} failed: ${lastError.message}`);
      }
    }

    throw lastError || new Error("All self-hosted rerank endpoints failed");
  }
}

export function createRerankProvider(
  apiUrl?: string,
  apiKey?: string,
): RerankProvider {
  return new SelfHostedRerankProvider(apiUrl, apiKey);
}

export const defaultRerankProvider = new SelfHostedRerankProvider();
