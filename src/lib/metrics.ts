// metrics — no-op on homelab; call sites already fire-and-forget.
// kept as a stable API so the rest of the codebase compiles unchanged.

export const Metrics = {
  rateLimitViolation: async (_endpoint: string): Promise<void> => {},
  llmLatency: async (_ms: number): Promise<void> => {},
  llmError: async (): Promise<void> => {},
  cohereError: async (_type: "embed" | "rerank"): Promise<void> => {},
  chatSessionCreated: async (): Promise<void> => {},
  embeddingBatchSize: async (_count: number): Promise<void> => {},
  embeddingSuccess: async (_count: number): Promise<void> => {},
  embeddingDimensionMismatch: async (_expected: number, _actual: number): Promise<void> => {},
  sseParseError: async (): Promise<void> => {},
  searchLatency: async (_mode: "semantic" | "exact" | "keyword" | "both", _ms: number): Promise<void> => {},
  rerankLatency: async (_ms: number): Promise<void> => {},
};
