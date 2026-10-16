import { describe, expect, it } from "vitest";
import {
  weekGridBlockPosition,
  weekGridOffset,
} from "@/components/calendar/week-view-utils";

const HOUR = 50;

describe("week grid positioning", () => {
  it("pins a midnight deadline to the top of the grid instead of above it", () => {
    expect(weekGridOffset(new Date(2026, 9, 6, 0, 0), HOUR)).toBe(0);
    expect(weekGridOffset(new Date(2026, 9, 6, 9, 30), HOUR)).toBe(3.5 * HOUR);
  });

  it("cuts a block that runs past midnight at the end of its start day", () => {
    expect(
      weekGridBlockPosition(new Date(2026, 9, 6, 23, 0), new Date(2026, 9, 7, 1, 0), HOUR),
    ).toEqual({ top: 17 * HOUR, height: HOUR });
  });

  it("keeps an early-morning block visible with a minimum height", () => {
    expect(
      weekGridBlockPosition(new Date(2026, 9, 6, 4, 0), new Date(2026, 9, 6, 5, 0), HOUR),
    ).toEqual({ top: 0, height: 14 });
  });

  it("clips a block that starts before the grid to the first visible hour", () => {
    expect(
      weekGridBlockPosition(new Date(2026, 9, 6, 5, 0), new Date(2026, 9, 6, 8, 0), HOUR),
    ).toEqual({ top: 0, height: 2 * HOUR });
  });
});
