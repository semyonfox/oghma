import { describe, expect, it } from "vitest";
import { createChatTools, parseTimeRange } from "@/lib/chat/build-stream";

describe("chat planning tools", () => {
  it("rejects malformed calendar timestamps before reaching persistence", async () => {
    await expect(
      createChatTools(
        "11111111-1111-1111-1111-111111111111",
        "22222222-2222-2222-2222-222222222222",
        null,
        {},
        false,
      ).executeApprovedAction("addTimeBlock", {
        title: "Study",
        startsAt: "not-a-date",
        endsAt: "also-not-a-date",
      }),
    ).rejects.toThrow("valid ISO 8601 timestamps");
  });
});

describe("parseTimeRange", () => {
  it("rejects text the model passes as a calendar range before it reaches SQL", () => {
    expect(() => parseTimeRange("next week", "2026-10-06T00:00:00Z")).toThrow(
      "valid ISO 8601 timestamps",
    );
    expect(() =>
      parseTimeRange("2026-10-06T10:00:00Z", "2026-10-06T09:00:00Z"),
    ).toThrow("End must be after start");
  });

  it("normalizes offsets to the same instant", () => {
    const { start } = parseTimeRange(
      "2026-10-06T10:00:00+01:00",
      "2026-10-06T11:00:00+01:00",
    );
    expect(start.toISOString()).toBe("2026-10-06T09:00:00.000Z");
  });
});
