import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rerankChunks } from "@/lib/rerank";

describe("rerankChunks", () => {
  beforeEach(() => {
    process.env.RERANK_API_URL = "https://test.api";
    process.env.RERANK_API_KEY = "fake-key";
    process.env.RERANK_MODEL = "test-reranker";
    delete process.env.RERANK_FALLBACK_API_URL;
    delete process.env.RERANK_FALLBACK_MODEL;
    delete process.env.RERANK_FALLBACK_API_KEY;
    delete process.env.LLM_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

  it("uses the OpenRouter backup when SiliconFlow cannot serve reranking", async () => {
    process.env.RERANK_FALLBACK_API_URL = "https://openrouter.test";
    process.env.RERANK_FALLBACK_MODEL = "qwen/qwen3-reranker-8b";
    process.env.RERANK_FALLBACK_API_KEY = "rerank-openrouter-key";
    process.env.LLM_API_KEY = "chat-openrouter-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 402 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ index: 2, relevance_score: 0.96 }],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await rerankChunks("query", ["a", "b", "answer"], 1);

    expect(result).toEqual([{ index: 2, text: "answer", score: 0.96 }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("https://openrouter.test/rerank");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      model: "qwen/qwen3-reranker-8b",
    });
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe(
      "Bearer rerank-openrouter-key",
    );
  });

  it("uses the backup alone when the SiliconFlow credential has been removed", async () => {
    delete process.env.RERANK_API_KEY;
    process.env.RERANK_FALLBACK_API_URL = "https://openrouter.test";
    process.env.RERANK_FALLBACK_MODEL = "qwen/qwen3-reranker-8b";
    process.env.RERANK_FALLBACK_API_KEY = "rerank-openrouter-key";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ index: 1, relevance_score: 0.9 }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await rerankChunks("query", ["a", "answer", "c"], 1);

    expect(result[0].index).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://openrouter.test/rerank");
  });
});
