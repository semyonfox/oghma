// embeds a single query string for semantic search
// uses the same provider as batch embedding (SiliconFlow / any OpenAI-compatible API)

import { defaultEmbeddingProvider } from "@/lib/providers/self-hosted-embeddings";

export async function embedText(text: string): Promise<number[]> {
  const prefixed = `Instruct: Represent this query for retrieval\nQuery: ${text}`;
  return defaultEmbeddingProvider.embedSingle(prefixed);
}
