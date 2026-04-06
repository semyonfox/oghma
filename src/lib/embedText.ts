// embeds a single query for semantic search
import { embedRawTexts } from "@/lib/embeddings";

export async function embedText(text: string): Promise<number[]> {
  const vectors = await embedRawTexts([text]);
  if (vectors.length === 0)
    throw new Error("Embedding provider returned no vectors");
  return vectors[0];
}
