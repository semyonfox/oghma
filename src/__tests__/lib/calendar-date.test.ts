import { describe, expect, it } from "vitest";
import {
  addDaysToDateKey,
  calendarDayDifference,
  isoToDateKey,
  localDateKeyBoundaryToIso,
  localDateKeyRangeToIso,
  parseLocalDateKey,
} from "@/lib/notes/utils/calendar-date";

function withTimeZone<T>(timeZone: string, run: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    return run();
  } finally {
    if (previous === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previous;
    }
  }
}

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
    withTimeZone("America/Los_Angeles", () => {
      expect(isoToDateKey("2026-04-03T00:30:00Z")).toBe("2026-04-02");
    });
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

describe("localDateKeyBoundaryToIso", () => {
  it("uses the local start of day instead of UTC midnight", () => {
    withTimeZone("Europe/Dublin", () => {
      expect(localDateKeyBoundaryToIso("2026-03-30", "start")).toBe(
        "2026-03-29T23:00:00.000Z",
      );
    });
  });

  it("keeps the full visible local day across the Europe/Dublin DST transition", () => {
    withTimeZone("Europe/Dublin", () => {
      expect(localDateKeyBoundaryToIso("2026-03-29", "start")).toBe(
        "2026-03-29T00:00:00.000Z",
      );
      expect(localDateKeyBoundaryToIso("2026-03-29", "end")).toBe(
        "2026-03-29T22:59:59.999Z",
      );
    });
  });

  it("builds week fetch ranges from local date boundaries", () => {
    withTimeZone("Europe/Dublin", () => {
      expect(localDateKeyRangeToIso("2026-03-23", "2026-03-29")).toEqual({
        start: "2026-03-23T00:00:00.000Z",
        end: "2026-03-29T22:59:59.999Z",
      });
    });
  });

  it("returns invalid date keys unchanged", () => {
    expect(localDateKeyBoundaryToIso("not-a-date", "start")).toBe("not-a-date");
  });
});

describe("local calendar date helpers", () => {
  it("rejects impossible local date keys", () => {
    expect(parseLocalDateKey("2026-02-29")).toBeNull();
    expect(parseLocalDateKey("2024-02-29")).toBeInstanceOf(Date);
  });

  it("adds local calendar days across daylight saving changes", () => {
    withTimeZone("Europe/Dublin", () => {
      expect(addDaysToDateKey("2026-03-28", 1)).toBe("2026-03-29");
      expect(addDaysToDateKey("2026-03-29", 1)).toBe("2026-03-30");
    });
  });

  it("compares calendar days instead of rolling 24-hour intervals", () => {
    withTimeZone("Europe/Dublin", () => {
      expect(
        calendarDayDifference(
          new Date("2026-03-30T00:15:00+01:00"),
          new Date("2026-03-29T23:45:00+01:00"),
        ),
      ).toBe(1);
      expect(
        calendarDayDifference(
          new Date("2026-03-29T22:30:00+01:00"),
          new Date("2026-03-29T08:00:00+01:00"),
        ),
      ).toBe(0);
    });
  });
});
