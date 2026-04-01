import { describe, expect, it } from "vitest";
import { chooseExtractionRetryQueueUrl } from "@/lib/canvas/extraction-retry";

describe("chooseExtractionRetryQueueUrl", () => {
  it("prefers dedicated retry queue when available", () => {
    expect(
      chooseExtractionRetryQueueUrl(
        "https://sqs.eu-north-1.amazonaws.com/123/retry",
        "https://sqs.eu-north-1.amazonaws.com/123/main",
      ),
    ).toBe("https://sqs.eu-north-1.amazonaws.com/123/retry");
  });

  it("falls back to main queue when retry queue is missing", () => {
    expect(
      chooseExtractionRetryQueueUrl(
        "",
        "https://sqs.eu-north-1.amazonaws.com/123/main",
      ),
    ).toBe("https://sqs.eu-north-1.amazonaws.com/123/main");
  });

  it("returns null when both queues are unavailable", () => {
    expect(chooseExtractionRetryQueueUrl("", "")).toBeNull();
  });
});
