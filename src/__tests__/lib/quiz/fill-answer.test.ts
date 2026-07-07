import { describe, expect, it } from "vitest";
import {
  acceptedFillAnswers,
  isFillAnswerCorrect,
  normalizeFillAnswer,
} from "@/lib/quiz/fill-answer";

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

describe("acceptedFillAnswers", () => {
  it("normalizes and deduplicates stored alternatives", () => {
    expect(acceptedFillAnswers(["Café", "cafe", "Coffee"])).toEqual([
      "cafe",
      "coffee",
    ]);
  });

  it("splits compact alternatives stored in the answer string", () => {
    expect(acceptedFillAnswers("mitochondria | mitochondrion; power house")).toEqual([
      "mitochondria",
      "mitochondrion",
      "power house",
    ]);
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

  it("accepts synonym alternatives from the stored answer", () => {
    expect(isFillAnswerCorrect("mitochondrion", "mitochondria | mitochondrion")).toBe(
      true,
    );
  });

  it("accepts synonym alternatives from generated answer arrays", () => {
    expect(
      isFillAnswerCorrect("power house", [
        "mitochondria",
        "powerhouse",
        "power house",
      ]),
    ).toBe(true);
  });

  it("preserves slash-containing answers as one answer", () => {
    expect(isFillAnswerCorrect("TCP/IP", "TCP/IP")).toBe(true);
    expect(isFillAnswerCorrect("TCP", "TCP/IP")).toBe(false);
  });

  it("rejects blank answers", () => {
    expect(isFillAnswerCorrect(" --- ", "---")).toBe(false);
  });

  it("rejects different answers after normalization", () => {
    expect(isFillAnswerCorrect("mitosis", "meiosis")).toBe(false);
  });
});
