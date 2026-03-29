import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// force in-memory fallback — no redis in tests
vi.mock("@/lib/redis", () => ({
  redis: {},
  redisReady: false,
}));

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  isAccountLocked,
  isRateLimited,
  recordFailedAttempt,
  clearFailedAttempts,
  getLockoutMinutesRemaining,
  getRateLimitResetTime,
} from "@/lib/loginLockout.js";

const EMAIL = "lockout-test@example.com";

beforeEach(async () => {
  vi.useFakeTimers();
  await clearFailedAttempts(EMAIL);
  await clearFailedAttempts("other@example.com");
  await clearFailedAttempts("user@example.com");
});

afterEach(() => {
  vi.useRealTimers();
});

// --- isAccountLocked ---

describe("isAccountLocked", () => {
  it("returns false for a fresh email with no attempts", async () => {
    expect(await isAccountLocked(EMAIL)).toBe(false);
  });

  it("returns false when attempts are below threshold", async () => {
    for (let i = 0; i < 4; i++) await recordFailedAttempt(EMAIL);
    expect(await isAccountLocked(EMAIL)).toBe(false);
  });

  it("returns true after exactly MAX_ATTEMPTS (5) failures", async () => {
    for (let i = 0; i < 5; i++) await recordFailedAttempt(EMAIL);
    expect(await isAccountLocked(EMAIL)).toBe(true);
  });

  it("remains locked for attempts beyond MAX_ATTEMPTS", async () => {
    for (let i = 0; i < 7; i++) await recordFailedAttempt(EMAIL);
    expect(await isAccountLocked(EMAIL)).toBe(true);
  });

  it("unlocks after 30-minute lockout expires", async () => {
    for (let i = 0; i < 5; i++) await recordFailedAttempt(EMAIL);
    expect(await isAccountLocked(EMAIL)).toBe(true);
    vi.advanceTimersByTime(30 * 60 * 1000); // exactly 30 min
    expect(await isAccountLocked(EMAIL)).toBe(false);
  });

  it("stays locked at 29 minutes", async () => {
    for (let i = 0; i < 5; i++) await recordFailedAttempt(EMAIL);
    vi.advanceTimersByTime(29 * 60 * 1000);
    expect(await isAccountLocked(EMAIL)).toBe(true);
  });
});

// --- isRateLimited ---

describe("isRateLimited", () => {
  it("returns false for a fresh email", async () => {
    expect(await isRateLimited(EMAIL)).toBe(false);
  });

  it("returns false after a single attempt", async () => {
    await recordFailedAttempt(EMAIL);
    expect(await isRateLimited(EMAIL)).toBe(false);
  });

  it("returns false at 4 attempts (below threshold)", async () => {
    for (let i = 0; i < 4; i++) await recordFailedAttempt(EMAIL);
    expect(await isRateLimited(EMAIL)).toBe(false);
  });

  it("returns true at 5 attempts (threshold)", async () => {
    for (let i = 0; i < 5; i++) await recordFailedAttempt(EMAIL);
    expect(await isRateLimited(EMAIL)).toBe(true);
  });

  it("resets after the 15-minute window expires", async () => {
    for (let i = 0; i < 5; i++) await recordFailedAttempt(EMAIL);
    expect(await isRateLimited(EMAIL)).toBe(true);
    vi.advanceTimersByTime(15 * 60 * 1000 + 1);
    expect(await isRateLimited(EMAIL)).toBe(false);
  });
});

// --- recordFailedAttempt ---

describe("recordFailedAttempt", () => {
  it("does not throw for a fresh email", async () => {
    await expect(recordFailedAttempt(EMAIL)).resolves.toBeUndefined();
  });

  it("increments count on successive calls", async () => {
    await recordFailedAttempt(EMAIL);
    await recordFailedAttempt(EMAIL);
    await recordFailedAttempt(EMAIL);
    // 3 attempts should not trigger lock
    expect(await isAccountLocked(EMAIL)).toBe(false);
  });

  it("starts a new window after the previous one expires", async () => {
    for (let i = 0; i < 3; i++) await recordFailedAttempt(EMAIL);
    vi.advanceTimersByTime(15 * 60 * 1000 + 1); // expire window

    // new window — 3 more attempts should not lock (only 3 in new window)
    for (let i = 0; i < 3; i++) await recordFailedAttempt(EMAIL);
    expect(await isAccountLocked(EMAIL)).toBe(false);
  });
});

// --- clearFailedAttempts ---

describe("clearFailedAttempts", () => {
  it("resets both rate-limit and lockout state", async () => {
    for (let i = 0; i < 5; i++) await recordFailedAttempt(EMAIL);
    expect(await isRateLimited(EMAIL)).toBe(true);
    expect(await isAccountLocked(EMAIL)).toBe(true);

    await clearFailedAttempts(EMAIL);
    expect(await isRateLimited(EMAIL)).toBe(false);
    expect(await isAccountLocked(EMAIL)).toBe(false);
  });

  it("is safe to call on a fresh email", async () => {
    await expect(clearFailedAttempts(EMAIL)).resolves.toBeUndefined();
  });

  it("allows re-locking after clear + new attempts", async () => {
    for (let i = 0; i < 5; i++) await recordFailedAttempt(EMAIL);
    expect(await isAccountLocked(EMAIL)).toBe(true);

    await clearFailedAttempts(EMAIL);
    expect(await isAccountLocked(EMAIL)).toBe(false);

    // lock again
    for (let i = 0; i < 5; i++) await recordFailedAttempt(EMAIL);
    expect(await isAccountLocked(EMAIL)).toBe(true);
  });
});

// --- getLockoutMinutesRemaining ---

describe("getLockoutMinutesRemaining", () => {
  it("returns 0 when not locked", async () => {
    expect(await getLockoutMinutesRemaining(EMAIL)).toBe(0);
  });

  it("returns approximately 30 minutes right after lockout", async () => {
    for (let i = 0; i < 5; i++) await recordFailedAttempt(EMAIL);
    const mins = await getLockoutMinutesRemaining(EMAIL);
    expect(mins).toBeGreaterThanOrEqual(29);
    expect(mins).toBeLessThanOrEqual(30);
  });

  it("decreases as time passes", async () => {
    for (let i = 0; i < 5; i++) await recordFailedAttempt(EMAIL);
    vi.advanceTimersByTime(15 * 60 * 1000); // 15 min
    const mins = await getLockoutMinutesRemaining(EMAIL);
    expect(mins).toBeGreaterThanOrEqual(14);
    expect(mins).toBeLessThanOrEqual(15);
  });

  it("returns 0 after lockout expires", async () => {
    for (let i = 0; i < 5; i++) await recordFailedAttempt(EMAIL);
    vi.advanceTimersByTime(30 * 60 * 1000); // 30 min
    expect(await getLockoutMinutesRemaining(EMAIL)).toBe(0);
  });

  it("returns 0 after clearing attempts", async () => {
    for (let i = 0; i < 5; i++) await recordFailedAttempt(EMAIL);
    await clearFailedAttempts(EMAIL);
    expect(await getLockoutMinutesRemaining(EMAIL)).toBe(0);
  });
});

// --- getRateLimitResetTime ---

describe("getRateLimitResetTime", () => {
  it("returns 0 when no attempts recorded", async () => {
    expect(await getRateLimitResetTime(EMAIL)).toBe(0);
  });

  it("returns seconds remaining in the window after an attempt", async () => {
    await recordFailedAttempt(EMAIL);
    const secs = await getRateLimitResetTime(EMAIL);
    expect(secs).toBeGreaterThan(14 * 60);
    expect(secs).toBeLessThanOrEqual(15 * 60);
  });

  it("decreases as time passes", async () => {
    await recordFailedAttempt(EMAIL);
    vi.advanceTimersByTime(5 * 60 * 1000); // 5 min
    const secs = await getRateLimitResetTime(EMAIL);
    expect(secs).toBeGreaterThan(9 * 60);
    expect(secs).toBeLessThanOrEqual(10 * 60);
  });

  it("returns 0 after window expires", async () => {
    await recordFailedAttempt(EMAIL);
    vi.advanceTimersByTime(15 * 60 * 1000 + 1);
    expect(await getRateLimitResetTime(EMAIL)).toBe(0);
  });
});

// --- email normalization ---

describe("email normalization", () => {
  it("treats uppercase and lowercase as the same email", async () => {
    await recordFailedAttempt("USER@EXAMPLE.COM");
    await recordFailedAttempt("user@example.com");
    // 2 attempts under same normalized key
    expect(await isRateLimited("user@example.com")).toBe(false);
  });

  it("trims whitespace before and after", async () => {
    for (let i = 0; i < 5; i++)
      await recordFailedAttempt("  user@example.com  ");
    expect(await isRateLimited("user@example.com")).toBe(true);
  });

  it("handles mixed case and whitespace together", async () => {
    await recordFailedAttempt("  User@Example.COM  ");
    await recordFailedAttempt("USER@example.com");
    await recordFailedAttempt("user@EXAMPLE.com");
    await recordFailedAttempt("user@example.com");
    await recordFailedAttempt(" user@example.com ");
    expect(await isAccountLocked("USER@EXAMPLE.COM")).toBe(true);
  });
});

// --- isolation ---

describe("isolation between emails", () => {
  it("does not leak state between different emails", async () => {
    for (let i = 0; i < 5; i++) await recordFailedAttempt(EMAIL);
    expect(await isAccountLocked(EMAIL)).toBe(true);
    expect(await isAccountLocked("other@example.com")).toBe(false);
    expect(await isRateLimited("other@example.com")).toBe(false);
  });

  it("clearing one email does not affect another", async () => {
    for (let i = 0; i < 5; i++) await recordFailedAttempt(EMAIL);
    for (let i = 0; i < 5; i++) await recordFailedAttempt("other@example.com");

    await clearFailedAttempts(EMAIL);
    expect(await isAccountLocked(EMAIL)).toBe(false);
    expect(await isAccountLocked("other@example.com")).toBe(true);
  });
});
