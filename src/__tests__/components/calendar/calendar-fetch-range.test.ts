import { describe, expect, it } from "vitest";
import { getCalendarFetchRange } from "@/components/calendar/calendar-fetch-range";

describe("getCalendarFetchRange", () => {
  it("keeps the month request stable while selecting another day in that month", () => {
    expect(getCalendarFetchRange("2026-08-01T12:00:00.000Z", "month")).toEqual(
      getCalendarFetchRange("2026-08-31T12:00:00.000Z", "month"),
    );
  });

  it("requests only the displayed week for week view", () => {
    expect(getCalendarFetchRange("2026-08-15T12:00:00.000Z", "week")).toEqual({
      startDateKey: "2026-08-10",
      endDateKey: "2026-08-16",
    });
  });
});
