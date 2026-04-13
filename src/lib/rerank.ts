// reranks candidate chunks via configured rerank API (SiliconFlow, etc.)
// falls back to vector-distance ordering if provider is unavailable

import logger from "@/lib/logger";
import { defaultRerankProvider } from "@/lib/providers/self-hosted-rerank";

const TOP_N = 5;
const MIN_RELEVANCE = 0.15;

interface RerankResult {
  index: number;
  text: string;
  score: number;
}

function fallbackTopN(chunks: string[], topN: number): RerankResult[] {
  return chunks
    .slice(0, topN)
    .map((text, index) => ({ index, text, score: 1 }));
}

export async function rerankChunks(
  query: string,
  chunks: string[],
  topN = TOP_N,
): Promise<RerankResult[]> {
  if (chunks.length <= topN) {
    return chunks.map((text, index) => ({ index, text, score: 1 }));
  }

  if (!defaultRerankProvider.isConfigured()) {
    return fallbackTopN(chunks, topN);
  }

  try {
    const results = await defaultRerankProvider.rerank(query, chunks, topN);

    const filtered = results.filter((r) => r.score >= MIN_RELEVANCE);

    if (filtered.length === 0 && chunks.length > 0) {
      logger.warn("rerank: all results below relevance threshold, falling back to vector order", {
        query: query.slice(0, 50),
        candidateCount: chunks.length,
      });
      return fallbackTopN(chunks, topN);
    }

    return filtered;
  } catch (err) {
    logger.warn("rerank failed, falling back to vector order", {
      error: err instanceof Error ? err.message : String(err),
    });
    return fallbackTopN(chunks, topN);
  }
}
