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
    const work = vi.fn(async (_jobId: string) => true);
    const gated = unlessCanvasPaused(work);

    await gated("job-1");
    expect(work).not.toHaveBeenCalled();

    vi.stubEnv("CANVAS_CONTENT_IMPORT", "on");
    await gated("job-1");
    expect(work).toHaveBeenCalledWith("job-1");
  });
});
