import { describe, expect, it } from "vitest";
import {
  toFriendlyCanvasConnectError,
  toFriendlyCanvasError,
  toFriendlyCanvasLogMessage,
  toFriendlyChatError,
} from "@/lib/friendly-errors";

describe("friendly error helpers", () => {
  it("tells a first-time connect that Canvas rejected the token, not to reconnect", () => {
    const message = toFriendlyCanvasConnectError(
      "Canvas connection failed: Invalid or expired Canvas token",
    );
    expect(message).toContain("didn't accept that access token");
    expect(message).not.toContain("reconnect");
  });

  it("points a bad Canvas address at the login address", () => {
    expect(
      toFriendlyCanvasConnectError("Enter a valid HTTPS Canvas address without a port"),
    ).toContain("instructure.com");
    expect(
      toFriendlyCanvasConnectError("Canvas connection failed: Canvas API error: 404"),
    ).toContain("wasn't found at that address");
  });

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

  it("identifies locked and hidden Canvas files as restricted", () => {
    expect(
      toFriendlyCanvasLogMessage(
        "File is locked or hidden for this Canvas user",
      ),
    ).toContain("restricted");
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

it("explains inaccessible files and sections without a raw HTTP error", () => {
  expect(toFriendlyCanvasLogMessage("Canvas API error: 404")).toContain("Other files will continue");
  expect(toFriendlyCanvasLogMessage("Canvas API error: 410", true)).toContain("this section");
  expect(toFriendlyCanvasLogMessage("Canvas API rate limited")).toContain("Try this item again later");
  expect(toFriendlyCanvasLogMessage("Discovery did not finish")).toContain("stopped before this file");
});
