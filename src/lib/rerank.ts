// reranks candidate chunks via configured rerank API (SiliconFlow, etc.)
// falls back to vector-distance ordering if provider is unavailable

import logger from "@/lib/logger";
import { defaultRerankProvider } from "@/lib/providers/self-hosted-rerank";
import {
  getRerankMinRelevance,
  getRerankTopN,
} from "@/lib/ai-config";
import { Metrics } from "@/lib/metrics";

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
  topN = getRerankTopN(),
): Promise<RerankResult[]> {
  if (chunks.length <= topN) {
    return chunks.map((text, index) => ({ index, text, score: 1 }));
  }

  if (!defaultRerankProvider.isConfigured()) {
    return fallbackTopN(chunks, topN);
  }

  try {
    const rerankStartedAt = Date.now();
    const results = await defaultRerankProvider.rerank(query, chunks, topN);
    void Metrics.rerankLatency(Date.now() - rerankStartedAt);
    const minRelevance = getRerankMinRelevance();

    const filtered = results.filter((r) => r.score >= minRelevance);

    if (filtered.length === 0 && chunks.length > 0) {
      logger.warn("rerank: all results below relevance threshold, returning empty to force tool use", {
        query: query.slice(0, 50),
        candidateCount: chunks.length,
      });
    }

    return filtered;
  } catch (err) {
    logger.warn("rerank failed, falling back to vector order", {
      error: err instanceof Error ? err.message : String(err),
    });
    return fallbackTopN(chunks, topN);
  }
}
