import { describe, it, expect, vi } from "vitest";
import {
  chooseExtractionRetryQueueUrl,
  getExtractionRetryDelaySeconds,
} from "@/lib/canvas/extraction-retry";

describe("chooseExtractionRetryQueueUrl", () => {
  it("prefers the dedicated retry queue over the main queue", () => {
    expect(
      chooseExtractionRetryQueueUrl("https://sqs/retry", "https://sqs/main"),
    ).toBe("https://sqs/retry");
  });

  it("falls back to main queue when retry queue is empty string", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(chooseExtractionRetryQueueUrl("", "https://sqs/main")).toBe(
      "https://sqs/main",
    );
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns null when both queues are empty", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(chooseExtractionRetryQueueUrl("", "")).toBeNull();
  });

  it("trims whitespace from queue URLs", () => {
    expect(
      chooseExtractionRetryQueueUrl(
        "  https://sqs/retry  ",
        "https://sqs/main",
      ),
    ).toBe("https://sqs/retry");
  });
});

describe("getExtractionRetryDelaySeconds", () => {
  it("returns 30s for attempt 0 (first retry)", () => {
    expect(getExtractionRetryDelaySeconds(0)).toBe(30);
  });

  it("returns 120s for attempt 1", () => {
    expect(getExtractionRetryDelaySeconds(1)).toBe(120);
  });

  it("returns 480s for attempt 2", () => {
    expect(getExtractionRetryDelaySeconds(2)).toBe(480);
  });

  it("returns 900s for attempt 3 (max, also SQS max DelaySeconds)", () => {
    expect(getExtractionRetryDelaySeconds(3)).toBe(900);
  });

  it("caps at 900s for attempts beyond the array", () => {
    expect(getExtractionRetryDelaySeconds(99)).toBe(900);
  });
});
