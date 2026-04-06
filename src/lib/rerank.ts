// reranks candidate chunks via Cohere Rerank API
// purpose-built relevance scoring — faster and more accurate than LLM-based reranking
// uses rerank-multilingual-v3.0 to match the multilingual embedding model

import { Metrics } from "@/lib/metrics";
import logger from "@/lib/logger";
import { getCohereTimeoutMs } from "@/lib/ai-config";

const COHERE_RERANK_URL = "https://api.cohere.com/v2/rerank";
const COHERE_RERANK_MODEL = "rerank-multilingual-v3.0";
const TOP_N = 5;
// minimum relevance score from the reranker — below this the chunk is noise
const MIN_RELEVANCE = 0.15;
const DEFAULT_SELF_HOSTED_RERANK_PATHS = [
  "/api/rerank",
  "/api/v1/rerank",
  "/v1/rerank",
];

interface RerankResult {
  index: number;
  text: string;
  score: number;
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path}`;
}

function normalizeRerankResults(
  chunks: string[],
  results: any[],
): RerankResult[] {
  return results
    .map((r: any) => ({
      index: Number(r?.index),
      score: Number(
        r?.relevance_score ?? r?.score ?? r?.relevanceScore ?? Number.NaN,
      ),
    }))
    .filter(
      (r) =>
        Number.isInteger(r.index) &&
        r.index >= 0 &&
        r.index < chunks.length &&
        Number.isFinite(r.score),
    )
    .filter((r) => r.score >= MIN_RELEVANCE)
    .map((r) => ({
      index: r.index,
      text: chunks[r.index],
      score: r.score,
    }));
}

async function rerankWithSelfHosted(
  query: string,
  chunks: string[],
  topN: number,
): Promise<RerankResult[] | null> {
  const baseUrl =
    (process.env.RERANK_API_URL ?? "").trim() ||
    (process.env.EMBEDDING_API_URL ?? "").trim();
  if (!baseUrl) return null;

  const apiKey =
    (process.env.RERANK_API_KEY ?? "").trim() ||
    (process.env.EMBEDDING_API_KEY ?? "").trim() ||
    (process.env.DATALAB_API_KEY ?? "").trim() ||
    "";
  const model =
    (process.env.RERANK_MODEL ?? "").trim() ||
    "bge-reranker-v2-m3";
  const timeoutMs = getCohereTimeoutMs();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  for (const path of DEFAULT_SELF_HOSTED_RERANK_PATHS) {
    try {
      const res = await fetch(joinUrl(baseUrl, path), {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          query,
          documents: chunks,
          top_n: topN,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) continue;
      const json = await res.json();
      const raw = Array.isArray(json?.results)
        ? json.results
        : Array.isArray(json?.data)
          ? json.data
          : [];
      const normalized = normalizeRerankResults(chunks, raw);
      if (normalized.length > 0) return normalized;
    } catch {
      // Try next endpoint.
    }
  }

  return null;
}

export async function rerankChunks(
  query: string,
  chunks: string[],
  topN = TOP_N,
): Promise<RerankResult[]> {
  if (chunks.length <= topN) {
    return chunks.map((text, index) => ({ index, text, score: 1 }));
  }

  const apiKey = process.env.COHERE_API_KEY;
  const timeoutMs = getCohereTimeoutMs();
  if (!apiKey) {
    // no API key — fall back to top-N by vector distance order (already sorted)
    const selfHosted = await rerankWithSelfHosted(query, chunks, topN);
    if (selfHosted && selfHosted.length > 0) return selfHosted;
    return chunks.slice(0, topN).map((text, index) => ({ index, text, score: 1 }));
  }

  const selfHosted = await rerankWithSelfHosted(query, chunks, topN);
  if (selfHosted && selfHosted.length > 0) return selfHosted;

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
