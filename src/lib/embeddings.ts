// batch-embeds chunks via the configured embedding provider (SiliconFlow, etc.)
// strips markdown syntax before embedding — ###, ---, ** etc. are noise in vector space
// the original markdown chunk text is preserved in chunks.text for LLM RAG context

import { stripMarkdown } from "./strip-markdown";
import { defaultEmbeddingProvider } from "@/lib/providers/self-hosted-embeddings";

export async function embedChunks(
  chunks: string[],
): Promise<{ chunk: string; vector: number[] }[]> {
  const nonEmpty = chunks.filter((c) => c?.trim());
  if (nonEmpty.length === 0) return [];

  const prepared = nonEmpty.map(
    (c) => `Instruct: Represent this document for retrieval\nDocument: ${stripMarkdown(c)}`,
  );
  const vectors = await defaultEmbeddingProvider.embedBatch(prepared);

  return nonEmpty.map((chunk, i) => ({ chunk, vector: vectors[i] }));
}
