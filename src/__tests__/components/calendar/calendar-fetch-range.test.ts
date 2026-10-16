import { describe, expect, it } from "vitest";
import { getCalendarFetchRange } from "@/components/calendar/calendar-fetch-range";
import { buildMonthCells } from "@/components/calendar/month-view-utils";

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

  it("covers the trailing cells of a month that starts on a Monday", () => {
    // february 2027 shows 14 days of march in its six-week grid
    expect(getCalendarFetchRange("2027-02-10T12:00:00.000Z", "month")).toEqual({
      startDateKey: "2027-02-01",
      endDateKey: "2027-03-14",
    });
  });

  it("requests exactly the rendered month grid for every month", () => {
    for (let month = 0; month < 24; month += 1) {
      const anchor = new Date(2026, month, 15, 12);
      const cells = buildMonthCells({
        anchorDate: anchor,
        assignments: [],
        timeBlocks: [],
        selectedDate: null,
        today: anchor,
      });
      expect(getCalendarFetchRange(anchor.toISOString(), "month")).toEqual({
        startDateKey: cells[0].date,
        endDateKey: cells[cells.length - 1].date,
      });
    }
  });
});
