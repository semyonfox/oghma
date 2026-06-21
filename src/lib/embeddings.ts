// batch-embeds chunks via the configured embedding provider (SiliconFlow, etc.)
// strips markdown syntax before embedding — ###, ---, ** etc. are noise in vector space
// the original markdown chunk text is preserved in chunks.text for LLM RAG context

import { stripMarkdown } from "./strip-markdown";
import { defaultEmbeddingProvider } from "@/lib/providers/self-hosted-embeddings";
import { getEmbeddingBatchSize } from "@/lib/ai-config";
import { Metrics } from "@/lib/metrics";

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
