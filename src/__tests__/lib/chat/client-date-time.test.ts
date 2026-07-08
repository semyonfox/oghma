import { describe, expect, it } from "vitest";
import { normalizeClientDateTime } from "@/lib/chat/client-date-time";

describe("normalizeClientDateTime", () => {
  it("accepts ISO timestamps with offset and optional zone annotation", () => {
    expect(normalizeClientDateTime("2026-07-08T12:34:56Z")).toBe(
      "2026-07-08T12:34:56Z",
    );
    expect(
      normalizeClientDateTime(" 2026-07-08T12:34:56.123+01:00[Europe/Dublin] "),
    ).toBe("2026-07-08T12:34:56.123+01:00[Europe/Dublin]");
  });

  it("drops malformed or oversized values", () => {
    expect(normalizeClientDateTime("2026-07-08")).toBeUndefined();
    expect(normalizeClientDateTime("2026-07-08T12:34:56")).toBeUndefined();
    expect(normalizeClientDateTime("x".repeat(97))).toBeUndefined();
    expect(normalizeClientDateTime(null)).toBeUndefined();
  });
});
