import { describe, expect, it } from "vitest";
import { pomodoroCountForRange } from "@/lib/time-blocks";

describe("pomodoroCountForRange", () => {
  it.each([
    ["a short block", "2026-08-01T09:00:00Z", "2026-08-01T09:25:00Z", 1],
    ["an exact block", "2026-08-01T09:00:00Z", "2026-08-01T09:30:00Z", 1],
    ["a partial additional block", "2026-08-01T09:00:00Z", "2026-08-01T09:31:00Z", 2],
    ["multiple blocks", "2026-08-01T09:00:00Z", "2026-08-01T10:30:00Z", 3],
  ])("returns $expected for $label", (_label, start, end, expected) => {
    expect(pomodoroCountForRange(new Date(start), new Date(end))).toBe(expected);
  });
});
