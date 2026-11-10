import { describe, expect, it } from "vitest";
import { canvasContentEnabled } from "@/lib/canvas/content-policy";

describe("canvasContentEnabled", () => {
  it("is off unless explicitly turned on", () => {
    expect(canvasContentEnabled({})).toBe(false);
    expect(canvasContentEnabled({ CANVAS_CONTENT_IMPORT: "true" })).toBe(false);
    expect(canvasContentEnabled({ CANVAS_CONTENT_IMPORT: "on" })).toBe(true);
  });
});
