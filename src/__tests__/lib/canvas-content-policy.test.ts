import { afterEach, describe, expect, it, vi } from "vitest";
import { canvasContentEnabled, unlessCanvasPaused } from "@/lib/canvas/content-policy";

describe("canvasContentEnabled", () => {
  it("is off unless explicitly turned on", () => {
    expect(canvasContentEnabled({})).toBe(false);
    expect(canvasContentEnabled({ CANVAS_CONTENT_IMPORT: "true" })).toBe(false);
    expect(canvasContentEnabled({ CANVAS_CONTENT_IMPORT: "on" })).toBe(true);
  });
});

describe("unlessCanvasPaused", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("skips canvas worker work while paused and runs it once switched on", async () => {
    vi.stubEnv("CANVAS_CONTENT_IMPORT", undefined);
    const completed: string[] = [];
    const gated = unlessCanvasPaused(async (jobId: string) => {
      completed.push(jobId);
    });

    await gated("job-paused");
    expect(completed).toEqual([]);

    vi.stubEnv("CANVAS_CONTENT_IMPORT", "on");
    await gated("job-running");
    expect(completed).toEqual(["job-running"]);
  });
});
