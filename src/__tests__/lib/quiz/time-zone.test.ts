import { describe, expect, it } from "vitest";
import { dateKeyInTimeZone, resolveTimeZone } from "@/lib/quiz/time-zone";

describe("quiz time zones", () => {
  it.each([
    ["Europe/Dublin", "Europe/Dublin"],
    ["not/a-zone", "UTC"],
    ["", "UTC"],
    [42, "UTC"],
    ["x".repeat(80), "UTC"],
  ])("resolves %s to %s", (input, expected) => {
    expect(resolveTimeZone(input)).toBe(expected);
  });

  it("formats the local calendar day around midnight and DST", () => {
    const instant = new Date("2026-10-25T00:30:00.000Z");
    expect(dateKeyInTimeZone(instant, "UTC")).toBe("2026-10-25");
    expect(dateKeyInTimeZone(instant, "America/New_York")).toBe("2026-10-24");
    expect(dateKeyInTimeZone(instant, "Asia/Kolkata")).toBe("2026-10-25");
  });
});
