import { describe, it, expect } from "vitest";
import { getExtractionRetryDelaySeconds } from "@/lib/canvas/extraction-retry";

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

  it("returns 900s for attempt 3 (max retry delay)", () => {
    expect(getExtractionRetryDelaySeconds(3)).toBe(900);
  });

  it("caps at 900s for attempts beyond the array", () => {
    expect(getExtractionRetryDelaySeconds(99)).toBe(900);
  });
});
