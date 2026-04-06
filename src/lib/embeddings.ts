// batch-embeds chunks via Cohere embed API v2
// uses embed-multilingual-v3.0 (1024 dims) with asymmetric input_type for better retrieval
// strips markdown syntax before embedding — ###, ---, ** etc. are noise in vector space
// the original markdown chunk text is preserved in chunks.text for LLM RAG context

import { getCohereTimeoutMs } from "@/lib/ai-config";
import { Metrics } from "@/lib/metrics";
import { stripMarkdown } from "./strip-markdown";

const COHERE_URL = "https://api.cohere.com/v2/embed";
const COHERE_MODEL = "embed-multilingual-v3.0";
const BATCH_SIZE = 96; // Cohere allows up to 96 texts per request
const DEFAULT_SELF_HOSTED_PATHS = [
  "/api/embeddings",
  "/api/v1/embeddings",
  "/v1/embeddings",
  "/ollama/api/embed",
];

function buildRequest(apiKey: string, batch: string[]) {
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      texts: batch,
      model: COHERE_MODEL,
      input_type: "search_document",
      embedding_types: ["float"],
    }),
  };
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path}`;
}

function parseEmbeddingVectors(json: any): number[][] {
  if (Array.isArray(json?.data)) {
    return json.data
      .map((row: any) => row?.embedding)
      .filter((embedding: unknown) => Array.isArray(embedding));
  }

  if (Array.isArray(json?.embeddings?.float)) {
    return json.embeddings.float;
  }

  if (Array.isArray(json?.embeddings)) {
    return json.embeddings;
  }

  if (Array.isArray(json?.embedding)) {
    return [json.embedding];
  }

  return [];
}

async function embedWithSelfHostedApi(
  batch: string[],
): Promise<number[][] | null> {
  const baseUrl = (process.env.EMBEDDING_API_URL ?? "").trim();
  if (!baseUrl) return null;

  const apiKey =
    (process.env.EMBEDDING_API_KEY ?? "").trim() ||
    (process.env.DATALAB_API_KEY ?? "").trim() ||
    "";
  const model = (process.env.EMBEDDING_MODEL ?? "").trim();
  const timeoutMs = getCohereTimeoutMs();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  for (const path of DEFAULT_SELF_HOSTED_PATHS) {
    try {
      const isOllamaEmbed = path === "/ollama/api/embed";
      const body = isOllamaEmbed
        ? {
            ...(model ? { model } : {}),
            input: batch,
          }
        : {
            ...(model ? { model } : {}),
            input: batch,
          };

      const res = await fetch(joinUrl(baseUrl, path), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) {
        continue;
      }

      const json = await res.json();
      const vectors = parseEmbeddingVectors(json);
      if (vectors.length === batch.length) return vectors;
    } catch {
      // Try the next candidate endpoint.
    }
  }

  return null;
}

export async function embedRawTexts(texts: string[]): Promise<number[][]> {
  const nonEmpty = texts.filter((c) => c?.trim());
  if (nonEmpty.length === 0) return [];

  const selfHosted = await embedWithSelfHostedApi(nonEmpty);
  if (selfHosted && selfHosted.length > 0) {
    return selfHosted;
  }

  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) throw new Error("COHERE_API_KEY not configured");

  const vectors: number[][] = [];
  let failures = 0;

  for (let i = 0; i < nonEmpty.length; i += BATCH_SIZE) {
    const batch = nonEmpty.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(COHERE_URL, {
        ...buildRequest(apiKey, batch),
        signal: AbortSignal.timeout(getCohereTimeoutMs()),
      });
      if (!res.ok) {
        void Metrics.cohereError("embed");
        console.warn(
          `Cohere embed failed (${res.status}), skipping ${batch.length} chunks`,
        );
        failures += batch.length;
        continue;
      }
      const json = await res.json();
      const batchVectors: number[][] = json.embeddings?.float ?? [];
      vectors.push(...batchVectors);
    } catch (err) {
      void Metrics.cohereError("embed");
      console.warn(
        `Cohere embed error: ${err instanceof Error ? err.message : err}`,
      );
      failures += batch.length;
    }
  }

  if (failures > 0) {
    throw new Error(
      `Cohere embedding incomplete: ${failures}/${nonEmpty.length} chunks failed`,
    );
  }

  return vectors;
}

export async function embedChunks(
  chunks: string[],
): Promise<{ chunk: string; vector: number[] }[]> {
  const nonEmpty = chunks.filter((c) => c?.trim());
  if (nonEmpty.length === 0) return [];

  const results: { chunk: string; vector: number[] }[] = [];

  // strip markdown for cleaner embeddings — the original chunk is stored in DB
  const stripped = nonEmpty.map((c) => stripMarkdown(c));
  const vectors = await embedRawTexts(stripped);

  for (let i = 0; i < vectors.length && i < nonEmpty.length; i++) {
    // chunk = original markdown (for LLM context), vector = from stripped text
    results.push({ chunk: nonEmpty[i], vector: vectors[i] });
  }

  return results;
}
