// reranks candidate chunks via self-hosted rerank (optional) or Cohere fallback
// purpose-built relevance scoring — faster and more accurate than LLM-based reranking

import { Metrics } from "@/lib/metrics";
import logger from "@/lib/logger";
import { getCohereTimeoutMs } from "@/lib/ai-config";
import { defaultRerankProvider } from "@/lib/providers/self-hosted-rerank";

const COHERE_RERANK_URL = "https://api.cohere.com/v2/rerank";
const COHERE_RERANK_MODEL = "rerank-multilingual-v3.0";
const TOP_N = 5;
// minimum relevance score from the reranker — below this the chunk is noise
const MIN_RELEVANCE = 0.15;

interface RerankResult {
  index: number;
  text: string;
  score: number;
}

async function rerankViaCohere(
  query: string,
  chunks: string[],
  topN: number,
): Promise<RerankResult[]> {
  if (chunks.length <= topN) {
    return chunks.map((text, index) => ({ index, text, score: 1 }));
  }

  const apiKey = process.env.COHERE_API_KEY;
  const timeoutMs = getCohereTimeoutMs();
  if (!apiKey) {
    // no API key — fall back to top-N by vector distance order (already sorted)
    return chunks
      .slice(0, topN)
      .map((text, index) => ({ index, text, score: 1 }));
  }

  try {
    const res = await fetch(COHERE_RERANK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: COHERE_RERANK_MODEL,
        query,
        documents: chunks.map((text) => ({ text })),
        top_n: topN,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      void Metrics.cohereError("rerank");
      return chunks
        .slice(0, topN)
        .map((text, index) => ({ index, text, score: 1 }));
    }

    const json = await res.json();
    const results: { index: number; relevance_score: number }[] =
      json.results ?? [];

    const filtered = results
      .filter((r) => r.relevance_score >= MIN_RELEVANCE)
      .map((r) => ({
        index: r.index,
        text: chunks[r.index],
        score: r.relevance_score,
      }));

    // if reranker returned results but all scored below threshold, fall back to
    // top-N by original vector distance so the pipeline still has context
    if (filtered.length === 0 && chunks.length > 0) {
      logger.warn(
        "rerank: all results below relevance threshold, falling back to vector order",
        {
          query: query.slice(0, 50),
          candidateCount: chunks.length,
        },
      );
      return chunks
        .slice(0, topN)
        .map((text, index) => ({ index, text, score: 0 }));
    }

    return filtered;
  } catch {
    void Metrics.cohereError("rerank");
    return chunks
      .slice(0, topN)
      .map((text, index) => ({ index, text, score: 1 }));
  }
}

export async function rerankChunks(
  query: string,
  chunks: string[],
  topN = TOP_N,
): Promise<RerankResult[]> {
  if (chunks.length <= topN) {
    return chunks.map((text, index) => ({ index, text, score: 1 }));
  }

  // try self-hosted rerank first, fall back to Cohere
  if (defaultRerankProvider.isConfigured()) {
    try {
      const results = await defaultRerankProvider.rerank(query, chunks, topN);
      return results as RerankResult[];
    } catch (err) {
      console.info(
        `Self-hosted rerank unavailable, falling back to Cohere: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  return rerankViaCohere(query, chunks, topN);
}
