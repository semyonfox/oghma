// embeds text through the configured provider (SiliconFlow or any OpenAI-compatible API)
// documents and queries share one provider but use different instruction prefixes

import { stripMarkdown } from "./strip-markdown";
import { defaultEmbeddingProvider } from "@/lib/rag/embedding-provider";
import { getEmbeddingBatchSize } from "@/lib/ai-config";
import { Metrics } from "@/lib/metrics";

// embeds a single query string for semantic search
export async function embedText(text: string): Promise<number[]> {
  const prefixed = `Instruct: Represent this query for retrieval\nQuery: ${text}`;
  return defaultEmbeddingProvider.embedSingle(prefixed);
}

// batch-embeds chunks, stripping markdown first because ###, ---, ** etc. are noise in
// vector space. the original markdown stays in chunks.text for LLM RAG context
export async function embedChunks(
  chunks: string[],
): Promise<{ chunk: string; vector: number[] }[]> {
  const nonEmpty = chunks.filter((c) => c?.trim());
  if (nonEmpty.length === 0) return [];
  const batchSize = getEmbeddingBatchSize();
  const vectors: { chunk: string; vector: number[] }[] = [];

  for (let index = 0; index < nonEmpty.length; index += batchSize) {
    const chunkBatch = nonEmpty.slice(index, index + batchSize);
    const prepared = chunkBatch.map(
      (c) => `Instruct: Represent this document for retrieval\nDocument: ${stripMarkdown(c)}`,
    );
    void Metrics.embeddingBatchSize(prepared.length);
    const embedded = await defaultEmbeddingProvider.embedBatch(prepared);

    if (embedded.length && embedded[0]?.length) {
      const expectedDims = embedded[0].length;
      for (const vector of embedded) {
        if (vector.length !== expectedDims) {
          void Metrics.embeddingDimensionMismatch(expectedDims, vector.length);
          throw new Error(
            `Embedding dimension mismatch: expected ${expectedDims}, got ${vector.length}`,
          );
        }
      }
    }

    vectors.push(
      ...embedded.map((vector, embeddedIndex) => ({
        chunk: chunkBatch[embeddedIndex],
        vector,
      })),
    );
    void Metrics.embeddingSuccess(embedded.length);
  }

  return vectors;
}
