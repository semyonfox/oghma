// batch-embeds chunks via Cohere embed API v2
// uses embed-multilingual-v3.0 (1024 dims) with asymmetric input_type for better retrieval
// strips markdown syntax before embedding — ###, ---, ** etc. are noise in vector space
// the original markdown chunk text is preserved in chunks.text for LLM RAG context

import { stripMarkdown } from "./strip-markdown";

const COHERE_URL = "https://api.cohere.com/v2/embed";
const COHERE_MODEL = "embed-multilingual-v3.0";
const BATCH_SIZE = 96; // Cohere allows up to 96 texts per request

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

export async function embedChunks(
  chunks: string[],
): Promise<{ chunk: string; vector: number[] }[]> {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) throw new Error("COHERE_API_KEY not configured");

  const nonEmpty = chunks.filter((c) => c?.trim());
  if (nonEmpty.length === 0) return [];

  const results: { chunk: string; vector: number[] }[] = [];

  // strip markdown for cleaner embeddings — the original chunk is stored in DB
  const stripped = nonEmpty.map((c) => stripMarkdown(c));

  let failures = 0;

  for (let i = 0; i < nonEmpty.length; i += BATCH_SIZE) {
    const batch = stripped.slice(i, i + BATCH_SIZE);
    const originalBatch = nonEmpty.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(COHERE_URL, buildRequest(apiKey, batch));
      if (!res.ok) {
        console.warn(
          `Cohere embed failed (${res.status}), skipping ${batch.length} chunks`,
        );
        failures += batch.length;
        continue;
      }
      const json = await res.json();
      const vectors: number[][] = json.embeddings?.float ?? [];
      for (let j = 0; j < vectors.length && j < batch.length; j++) {
        // chunk = original markdown (for LLM context), vector = from stripped text
        results.push({ chunk: originalBatch[j], vector: vectors[j] });
      }
    } catch (err) {
      console.warn(
        `Cohere embed error: ${err instanceof Error ? err.message : err}`,
      );
      failures += batch.length;
    }
  }

  // if any batches failed, throw so the caller can retry rather than storing incomplete embeddings
  if (failures > 0) {
    throw new Error(
      `Cohere embedding incomplete: ${failures}/${nonEmpty.length} chunks failed`,
    );
  }

  return results;
}
