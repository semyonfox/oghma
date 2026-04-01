import { describe, expect, it } from "vitest";
import { normalizeChunksForIndexing } from "@/lib/rag/indexing";

describe("normalizeChunksForIndexing", () => {
  it("drops blank chunks and keeps first-seen order", () => {
    const out = normalizeChunksForIndexing([
      "",
      "  ",
      "alpha",
      "beta",
      "alpha",
      "\n\tbeta\n",
      "gamma",
    ]);

    expect(out).toEqual(["alpha", "beta", "gamma"]);
  });

  it("trims chunk text before dedupe", () => {
    const out = normalizeChunksForIndexing([
      "  heading one  ",
      "heading one",
      "heading two",
      "heading two   ",
    ]);

    expect(out).toEqual(["heading one", "heading two"]);
  });
});
