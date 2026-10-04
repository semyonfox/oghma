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
    fallbackApiUrl: process.env.RERANK_FALLBACK_API_URL || "",
    fallbackModel: process.env.RERANK_FALLBACK_MODEL || "",
    fallbackApiKey: process.env.RERANK_FALLBACK_API_KEY || "",
  };
}

interface Endpoint {
  apiUrl: string;
  apiKey: string;
  model: string;
}

function configured(endpoint: Endpoint): boolean {
  return !!(endpoint.apiUrl && endpoint.apiKey && endpoint.model);
}

async function requestRerank(
  endpoint: Endpoint,
  query: string,
  chunks: string[],
  topN: number,
): Promise<Array<{ index: number; text: string; score: number }>> {
  const res = await fetch(`${endpoint.apiUrl}/rerank`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${endpoint.apiKey}`,
    },
    body: JSON.stringify({
      model: endpoint.model,
      query,
      documents: chunks,
      top_n: topN,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`Rerank API ${res.status}`);
  }

  const json: unknown = await res.json();
  const results =
    typeof json === "object" && json !== null && "results" in json
      ? json.results
      : undefined;
  if (!Array.isArray(results)) {
    throw new Error("Rerank API returned invalid results");
  }
  const parsed: Array<{ index: number; relevance_score: number }> = [];
  for (const raw of results) {
    const item: unknown = raw;
    if (
      typeof item !== "object" ||
      item === null ||
      !("index" in item) ||
      typeof item.index !== "number" ||
      !Number.isInteger(item.index) ||
      item.index < 0 ||
      item.index >= chunks.length ||
      !("relevance_score" in item) ||
      typeof item.relevance_score !== "number" ||
      !Number.isFinite(item.relevance_score)
    ) {
      throw new Error("Rerank API returned invalid results");
    }
    parsed.push({ index: item.index, relevance_score: item.relevance_score });
  }

  return parsed.map((item) => ({
    index: item.index,
    text: chunks[item.index],
    score: item.relevance_score,
  }));
}

class RerankAPIProvider implements RerankProvider {
  name = "rerank-api";

  isConfigured(): boolean {
    const {
      apiUrl,
      apiKey,
      model,
      fallbackApiUrl,
      fallbackApiKey,
      fallbackModel,
    } = env();
    return (
      configured({ apiUrl, apiKey, model }) ||
      configured({
        apiUrl: fallbackApiUrl,
        apiKey: fallbackApiKey,
        model: fallbackModel,
      })
    );
  }

  async rerank(
    query: string,
    chunks: string[],
    topN: number,
  ): Promise<Array<{ index: number; text: string; score: number }>> {
    const {
      apiUrl,
      apiKey,
      model,
      fallbackApiUrl,
      fallbackApiKey,
      fallbackModel,
    } = env();
    const primary = { apiUrl, apiKey, model };
    const fallback = {
      apiUrl: fallbackApiUrl,
      apiKey: fallbackApiKey,
      model: fallbackModel,
    };
    if (!configured(primary) && !configured(fallback)) {
      throw new Error(
        "Rerank provider not configured (RERANK_API_URL/KEY/MODEL)",
      );
    }
    if (configured(primary)) {
      try {
        return await requestRerank(primary, query, chunks, topN);
      } catch (error) {
        if (!configured(fallback)) throw error;
      }
    }
    return requestRerank(fallback, query, chunks, topN);
  }
}

export const defaultRerankProvider = new RerankAPIProvider();
