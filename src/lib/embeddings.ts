// batch-embeds chunks via self-hosted embeddings (preferred) or Cohere fallback
// strips markdown syntax before embedding — ###, ---, ** etc. are noise in vector space
// the original markdown chunk text is preserved in chunks.text for LLM RAG context

import { getCohereTimeoutMs } from "@/lib/ai-config";
import { Metrics } from "@/lib/metrics";
import { stripMarkdown } from "./strip-markdown";
import { defaultEmbeddingProvider } from "@/lib/providers/self-hosted-embeddings";

const COHERE_URL = "https://api.cohere.com/v2/embed";
const COHERE_MODEL = "embed-multilingual-v3.0";
const BATCH_SIZE = 96; // Cohere allows up to 96 texts per request

function buildCohereRequest(apiKey: string, batch: string[]) {
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

async function embedViaSelfHosted(
  chunks: string[],
): Promise<{ chunk: string; vector: number[] }[]> {
  if (!defaultEmbeddingProvider.isConfigured()) {
    throw new Error("Self-hosted embeddings not configured");
  }

  const nonEmpty = chunks.filter((c) => c?.trim());
  if (nonEmpty.length === 0) return [];

  const stripped = nonEmpty.map((c) => stripMarkdown(c));

  try {
    const vectors = await defaultEmbeddingProvider.embedBatch(stripped);
    return nonEmpty.map((chunk, i) => ({
      chunk,
      vector: vectors[i],
    }));
  } catch (err) {
    console.warn(
      `Self-hosted embed failed: ${err instanceof Error ? err.message : err}`,
    );
    throw err;
  }
}

async function embedViaCohere(
  chunks: string[],
): Promise<{ chunk: string; vector: number[] }[]> {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) throw new Error("COHERE_API_KEY not configured");

  const nonEmpty = chunks.filter((c) => c?.trim());
  if (nonEmpty.length === 0) return [];

  const results: { chunk: string; vector: number[] }[] = [];
  const stripped = nonEmpty.map((c) => stripMarkdown(c));

  let failures = 0;

  for (let i = 0; i < nonEmpty.length; i += BATCH_SIZE) {
    const batch = stripped.slice(i, i + BATCH_SIZE);
    const originalBatch = nonEmpty.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(COHERE_URL, {
        ...buildCohereRequest(apiKey, batch),
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
      const vectors: number[][] = json.embeddings?.float ?? [];
      for (let j = 0; j < vectors.length && j < batch.length; j++) {
        results.push({ chunk: originalBatch[j], vector: vectors[j] });
      }
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

  return results;
}

export async function embedChunks(
  chunks: string[],
): Promise<{ chunk: string; vector: number[] }[]> {
  // try self-hosted first, fall back to Cohere
  try {
    return await embedViaSelfHosted(chunks);
  } catch (err) {
    console.info(
      `Self-hosted embeddings unavailable, falling back to Cohere: ${
        err instanceof Error ? err.message : err
      }`,
    );
    return embedViaCohere(chunks);
  }
}
