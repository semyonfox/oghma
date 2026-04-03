import { describe, expect, it } from "vitest";
import {
  addMonthsClamped,
  isoToDateKey,
} from "@/lib/notes/utils/calendar-date";

describe("isoToDateKey", () => {
  it("maps UTC timestamps to the correct local day in Europe/Dublin", () => {
    expect(isoToDateKey("2026-04-02T23:30:00Z", "Europe/Dublin")).toBe(
      "2026-04-03",
    );
  });

  it("keeps UTC day when formatted in UTC", () => {
    expect(isoToDateKey("2026-04-02T23:30:00Z", "UTC")).toBe("2026-04-02");
  });

  it("can shift a timestamp backwards into the previous day", () => {
    expect(isoToDateKey("2026-04-03T00:30:00Z", "America/Los_Angeles")).toBe(
      "2026-04-02",
    );
  });

  it("uses local timezone formatting when no timezone is provided", () => {
    expect(isoToDateKey("2026-02-17T09:45:00.000Z")).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });

  it("returns a stable fallback for invalid timestamps", () => {
    expect(isoToDateKey("not-a-date")).toBe("not-a-date");
    expect(isoToDateKey("")).toBe("");
  });

  it("falls back gracefully when an invalid timezone is passed", () => {
    expect(() =>
      isoToDateKey("2026-04-03T09:00:00Z", "Mars/Olympus_Mons"),
    ).not.toThrow();
    expect(isoToDateKey("2026-04-03T09:00:00Z", "Mars/Olympus_Mons")).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });
});

describe("addMonthsClamped", () => {
  it("clamps Jan 31 to Feb 28 instead of skipping to March", () => {
    expect(addMonthsClamped("2026-01-31T12:00:00.000Z", 1)).toBe(
      "2026-02-28T12:00:00.000Z",
    );
  });

  it("clamps backwards from March 31 to February", () => {
    expect(addMonthsClamped("2026-03-31T12:00:00.000Z", -1)).toBe(
      "2026-02-28T12:00:00.000Z",
    );
  });

  it("handles leap years when clamping into February", () => {
    expect(addMonthsClamped("2024-01-31T12:00:00.000Z", 1)).toBe(
      "2024-02-29T12:00:00.000Z",
    );
  });

  it("moves across year boundaries in both directions", () => {
    expect(addMonthsClamped("2026-11-30T08:15:00.000Z", 2)).toBe(
      "2027-01-30T08:15:00.000Z",
    );
    expect(addMonthsClamped("2026-01-31T08:15:00.000Z", -1)).toBe(
      "2025-12-31T08:15:00.000Z",
    );
  });

  it("preserves the clock time while changing month", () => {
    expect(addMonthsClamped("2026-05-15T23:59:58.321Z", 3)).toBe(
      "2026-08-15T23:59:58.321Z",
    );
  });

  it("returns input unchanged for invalid timestamps", () => {
    expect(addMonthsClamped("not-a-date", 2)).toBe("not-a-date");
  });

  it("supports large positive and negative month jumps", () => {
    expect(addMonthsClamped("2026-01-31T00:00:00.000Z", 14)).toBe(
      "2027-03-31T00:00:00.000Z",
    );
    expect(addMonthsClamped("2026-03-31T00:00:00.000Z", -14)).toBe(
      "2025-01-31T00:00:00.000Z",
    );
  });
});
