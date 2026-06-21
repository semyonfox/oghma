import { describe, expect, it } from "vitest";
import { isFillAnswerCorrect, normalizeFillAnswer } from "@/lib/quiz/fill-answer";

describe("normalizeFillAnswer", () => {
  it("ignores case and surrounding whitespace", () => {
    expect(normalizeFillAnswer("  Photosynthesis  ")).toBe("photosynthesis");
  });

  it("collapses internal whitespace", () => {
    expect(normalizeFillAnswer("cell\n  membrane\ttransport")).toBe(
      "cell membrane transport",
    );
  });

  it("normalizes accents and punctuation", () => {
    expect(normalizeFillAnswer("Café-au-lait!")).toBe("cafe au lait");
  });
});

describe("isFillAnswerCorrect", () => {
  it("accepts punctuation-insensitive matches", () => {
    expect(isFillAnswerCorrect("binary search tree", "Binary-search tree")).toBe(
      true,
    );
  });

  it("accepts accent-insensitive matches", () => {
    expect(isFillAnswerCorrect("cafe au lait", "Café au lait")).toBe(true);
  });

  it("rejects blank answers", () => {
    expect(isFillAnswerCorrect(" --- ", "---")).toBe(false);
  });

  it("rejects different answers after normalization", () => {
    expect(isFillAnswerCorrect("mitosis", "meiosis")).toBe(false);
  });
});
