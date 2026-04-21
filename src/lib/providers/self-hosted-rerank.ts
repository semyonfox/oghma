// reranking via OpenRouter / any Cohere-compatible rerank API
// configured via RERANK_API_URL, RERANK_API_KEY, RERANK_MODEL

export interface RerankProvider {
  name: string;
  rerank(
    query: string,
    chunks: string[],
    topN: number,
  ): Promise<Array<{ index: number; text: string; score: number }>>;
  isConfigured(): boolean;
}

function env() {
  return {
    apiUrl: process.env.RERANK_API_URL || "",
    apiKey: process.env.RERANK_API_KEY || "",
    model: process.env.RERANK_MODEL || "",
  };
}

class RerankAPIProvider implements RerankProvider {
  name = "rerank-api";

  isConfigured(): boolean {
    const { apiUrl, apiKey, model } = env();
    return !!(apiUrl && apiKey && model);
  }

  async rerank(
    query: string,
    chunks: string[],
    topN: number,
  ): Promise<Array<{ index: number; text: string; score: number }>> {
    const { apiUrl, apiKey, model } = env();
    if (!(apiUrl && apiKey && model)) {
      throw new Error("Rerank provider not configured (RERANK_API_URL/KEY/MODEL)");
    }

    const res = await fetch(`${apiUrl}/v1/rerank`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        query,
        documents: chunks,
        top_n: topN,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Rerank API ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = await res.json();
    const results: Array<{ index: number; relevance_score: number }> =
      json.results ?? [];

    return results.map((r) => ({
      index: r.index,
      text: chunks[r.index],
      score: r.relevance_score,
    }));
  }
}

export const defaultRerankProvider = new RerankAPIProvider();
