import { describe, expect, it } from "vitest";
import {
  toFriendlyCanvasError,
  toFriendlyCanvasLogMessage,
  toFriendlyChatError,
} from "@/lib/friendly-errors";

describe("friendly error helpers", () => {
  it("maps raw Canvas auth errors to reconnect guidance", () => {
    expect(toFriendlyCanvasError("invalid access token")).toContain(
      "reconnect Canvas",
    );
  });

  it("maps Canvas log warm-up errors to a warm-up message", () => {
    expect(toFriendlyCanvasLogMessage("marker service timeout")).toContain(
      "warming up",
    );
  });

  it("maps backend chat config errors to unavailable message", () => {
    expect(toFriendlyChatError("LLM_API_KEY not configured")).toContain(
      "temporarily unavailable",
    );
  });

  it("falls back to generic friendly message for unknown errors", () => {
    expect(toFriendlyChatError("socket exploded")).toBe(
      "Something went wrong. Please try again.",
    );
  });
});
