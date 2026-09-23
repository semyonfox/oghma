// embedding provider — calls any OpenAI-compatible endpoint (SiliconFlow, ollama, etc.)
// configured via EMBEDDING_API_URL, EMBEDDING_API_KEY, EMBEDDING_MODEL

export interface EmbeddingProvider {
  name: string;
  embedBatch(texts: string[]): Promise<number[][]>;
  embedSingle(text: string): Promise<number[]>;
  isConfigured(): boolean;
}

// reads env vars at call time so tests can set them after import
function env() {
  return {
    apiUrl: process.env.EMBEDDING_API_URL || "",
    apiKey: process.env.EMBEDDING_API_KEY || "",
    model: process.env.EMBEDDING_MODEL || "",
    fallbackApiUrl: process.env.EMBEDDING_FALLBACK_API_URL || "",
    fallbackModel: process.env.EMBEDDING_FALLBACK_MODEL || "",
    fallbackApiKey: process.env.EMBEDDING_FALLBACK_API_KEY || "",
  };
}

interface Endpoint {
  apiUrl: string;
  apiKey: string;
  model: string;
}

function configured(endpoint: Endpoint): boolean {
  return !!(endpoint.apiUrl && endpoint.apiKey && endpoint.model);
}

async function requestEmbeddings(
  endpoint: Endpoint,
  texts: string[],
  timeoutMs: number,
): Promise<number[][]> {
  const res = await fetch(`${endpoint.apiUrl}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${endpoint.apiKey}`,
    },
    body: JSON.stringify({ input: texts, model: endpoint.model }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    throw new Error(`Embedding API ${res.status}`);
  }

  const json: unknown = await res.json();
  const data =
    typeof json === "object" && json !== null && "data" in json
      ? json.data
      : undefined;
  if (!Array.isArray(data)) {
    throw new Error("Embedding API returned invalid data");
  }
  if (data.length !== texts.length) {
    throw new Error(
      `Embedding count mismatch: got ${data.length}, expected ${texts.length}`,
    );
  }
  const configuredSize =
    process.env.QDRANT_VECTOR_SIZE?.trim() ||
    process.env.EMBEDDING_DIMENSIONS?.trim();
  const expectedSize = configuredSize ? Number(configuredSize) : undefined;
  if (
    expectedSize !== undefined &&
    (!Number.isSafeInteger(expectedSize) || expectedSize <= 0)
  ) {
    throw new Error("Invalid embedding vector size configuration");
  }
  const indexed = data.some(
    (item: unknown) =>
      typeof item === "object" && item !== null && "index" in item,
  );
  const embeddings: number[][] = new Array(data.length);
  const seen = new Set<number>();
  data.forEach((item: unknown, position) => {
    if (
      typeof item !== "object" ||
      item === null ||
      !("embedding" in item) ||
      !Array.isArray(item.embedding) ||
      !item.embedding.every(
        (value) => typeof value === "number" && Number.isFinite(value),
      )
    ) {
      throw new Error("Embedding API returned an invalid vector");
    }
    if (indexed && !("index" in item)) {
      throw new Error("Embedding API returned missing indices");
    }
    const index = "index" in item ? item.index : position;
    if (
      typeof index !== "number" ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= texts.length ||
      seen.has(index)
    ) {
      throw new Error("Embedding API returned invalid indices");
    }
    seen.add(index);
    const embedding = item.embedding.filter(
      (value): value is number => typeof value === "number",
    );
    if (expectedSize !== undefined) {
      if (embedding.length !== expectedSize) {
        throw new Error(
          `Embedding dimension mismatch: expected ${expectedSize}, got ${embedding.length}`,
        );
      }
    }
    embeddings[index] = embedding;
  });

  if (seen.size !== texts.length) {
    throw new Error("Embedding API returned missing indices");
  }

  return embeddings;
}

function positiveIntEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class SelfHostedEmbeddingProvider implements EmbeddingProvider {
  name = "self-hosted";

  isConfigured(): boolean {
    const {
      apiUrl,
      apiKey,
      model,
      fallbackApiUrl,
      fallbackApiKey,
      fallbackModel,
    } = env();
    return (
      configured({ apiUrl, apiKey, model }) ||
      configured({
        apiUrl: fallbackApiUrl,
        apiKey: fallbackApiKey,
        model: fallbackModel,
      })
    );
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const {
      apiUrl,
      apiKey,
      model,
      fallbackApiUrl,
      fallbackApiKey,
      fallbackModel,
    } = env();
    const primary = { apiUrl, apiKey, model };
    const fallback = {
      apiUrl: fallbackApiUrl,
      apiKey: fallbackApiKey,
      model: fallbackModel,
    };
    if (!configured(primary) && !configured(fallback)) {
      throw new Error(
        "Embedding provider not configured (EMBEDDING_API_URL/KEY/MODEL)",
      );
    }

    const timeoutMs = positiveIntEnv("EMBEDDING_TIMEOUT_MS", 120_000);
    const maxAttempts = positiveIntEnv("EMBEDDING_MAX_ATTEMPTS", 2);
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        if (configured(primary)) {
          try {
            return await requestEmbeddings(primary, texts, timeoutMs);
          } catch (error) {
            if (!configured(fallback)) throw error;
          }
        }
        return await requestEmbeddings(fallback, texts, timeoutMs);
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) {
          await delay(500 * attempt);
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  async embedSingle(text: string): Promise<number[]> {
    const [embedding] = await this.embedBatch([text]);
    if (!embedding) throw new Error("Failed to embed single text");
    return embedding;
  }
}

export const defaultEmbeddingProvider = new SelfHostedEmbeddingProvider();
