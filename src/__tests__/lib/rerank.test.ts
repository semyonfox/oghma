import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rerankChunks } from "@/lib/rerank";

describe("rerankChunks", () => {
  beforeEach(() => {
    process.env.RERANK_API_URL = "https://test.api";
    process.env.RERANK_API_KEY = "fake-key";
    process.env.RERANK_MODEL = "test-reranker";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns stable source indices from rerank results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            { index: 2, relevance_score: 0.91 },
            { index: 0, relevance_score: 0.73 },
          ],
        }),
      }),
    );

    const chunks = ["same", "same", "target"];
    const reranked = await rerankChunks("query", chunks, 2);

    expect(reranked).toEqual([
      { index: 2, text: "target", score: 0.91 },
      { index: 0, text: "same", score: 0.73 },
    ]);
  });

  it("falls back to vector order without rerank config", async () => {
    delete process.env.RERANK_API_URL;
    delete process.env.RERANK_API_KEY;
    delete process.env.RERANK_MODEL;
    const reranked = await rerankChunks("query", ["a", "b", "c"], 2);

    expect(reranked).toEqual([
      { index: 0, text: "a", score: 1 },
      { index: 1, text: "b", score: 1 },
    ]);
  });
});
