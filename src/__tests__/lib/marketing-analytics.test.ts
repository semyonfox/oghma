import { describe, expect, it } from "vitest";
import { isAnalyticsAdmin } from "@/lib/marketing/admin";
import { parseAnalyticsWindow } from "@/lib/marketing/analytics";
import { parseRetentionDays } from "@/lib/marketing/retention";

describe("analytics access", () => {
  it("matches a case-insensitive comma-separated allowlist", () => {
    const allowlist = "owner@example.com, Team@example.com";
    expect(isAnalyticsAdmin("team@example.com", allowlist)).toBe(true);
    expect(isAnalyticsAdmin("visitor@example.com", allowlist)).toBe(false);
  });

  it("fails closed when no allowlist is configured", () => {
    expect(isAnalyticsAdmin("owner@example.com", "")).toBe(false);
  });
});

describe("analytics configuration", () => {
  it("accepts supported report windows and defaults invalid input", () => {
    expect(parseAnalyticsWindow("7")).toBe(7);
    expect(parseAnalyticsWindow("90")).toBe(90);
    expect(parseAnalyticsWindow("365")).toBe(30);
  });

  it("bounds retention configuration", () => {
    expect(parseRetentionDays(undefined, 30)).toBe(30);
    expect(parseRetentionDays("1", 30)).toBe(30);
    expect(parseRetentionDays("99999", 30)).toBe(3650);
  });
});
