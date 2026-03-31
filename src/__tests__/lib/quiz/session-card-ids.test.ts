import { describe, expect, it } from "vitest";
import {
  getSessionCardIdAtIndex,
  normalizeSessionCardIds,
} from "@/lib/quiz/session-card-ids";

describe("normalizeSessionCardIds", () => {
  it("keeps valid UUIDs from an array", () => {
    const result = normalizeSessionCardIds([
      "019d4478-82f6-77cb-a25a-019270fbbcc1",
      "not-a-uuid",
    ]);

    expect(result).toEqual(["019d4478-82f6-77cb-a25a-019270fbbcc1"]);
  });

  it("parses legacy JSON-stringified arrays", () => {
    const raw = JSON.stringify([
      "019d4478-82f6-77cb-a25a-019270fbbcc1",
      "019d4478-82f6-77cb-a25a-019270fbbcc2",
    ]);

    expect(normalizeSessionCardIds(raw)).toEqual([
      "019d4478-82f6-77cb-a25a-019270fbbcc1",
      "019d4478-82f6-77cb-a25a-019270fbbcc2",
    ]);
  });

  it("returns an empty list for malformed values", () => {
    expect(normalizeSessionCardIds("oops")).toEqual([]);
    expect(normalizeSessionCardIds({})).toEqual([]);
    expect(normalizeSessionCardIds(null)).toEqual([]);
  });
});

describe("getSessionCardIdAtIndex", () => {
  it("returns null for out-of-range indexes", () => {
    expect(
      getSessionCardIdAtIndex(["019d4478-82f6-77cb-a25a-019270fbbcc1"], 2),
    ).toBeNull();
  });

  it("returns null when selected card id is invalid", () => {
    expect(getSessionCardIdAtIndex(["bad-id"], 0)).toBeNull();
  });

  it("returns selected UUID when present", () => {
    expect(
      getSessionCardIdAtIndex(["019d4478-82f6-77cb-a25a-019270fbbcc1"], 0),
    ).toBe("019d4478-82f6-77cb-a25a-019270fbbcc1");
  });
});
