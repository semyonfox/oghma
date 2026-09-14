import { beforeEach, describe, expect, it, vi } from "vitest";

const redisState = vi.hoisted(() => ({
  ready: true,
  ensureReady: vi.fn(async () => true),
  grants: new Map<string, { value: string; expiresAt: number }>(),
  set: vi.fn(),
  eval: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/database/pgsql", () => ({ default: vi.fn() }));
vi.mock("@/lib/redis", () => ({
  get redisReady() {
    return redisState.ready;
  },
  ensureRedisReady: redisState.ensureReady,
  redis: {
    set: redisState.set,
    eval: redisState.eval,
  },
}));

import {
  MOBILE_AUTH_GRANT_TTL_SECONDS,
  MobileAuthStoreUnavailableError,
  consumeMobileAuthGrant,
  createCodeChallenge,
  issueMobileAuthGrant,
} from "@/lib/mobile-auth";
import { RATE_LIMITS } from "@/lib/rateLimitConfig";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const VERIFIER = "a".repeat(64);

beforeEach(() => {
  vi.clearAllMocks();
  redisState.ready = true;
  redisState.ensureReady.mockResolvedValue(true);
  redisState.grants.clear();

  redisState.set.mockImplementation(
    async (key: string, value: string, _ex: string, ttl: number) => {
      if (redisState.grants.has(key)) return null;
      redisState.grants.set(key, {
        value,
        expiresAt: Date.now() + ttl * 1000,
      });
      return "OK";
    },
  );

  redisState.eval.mockImplementation(
    async (_script: string, _keyCount: number, key: string, challenge: string) => {
      const stored = redisState.grants.get(key);
      if (!stored || stored.expiresAt <= Date.now()) {
        redisState.grants.delete(key);
        return null;
      }
      const grant: unknown = JSON.parse(stored.value);
      if (
        typeof grant !== "object" ||
        grant === null ||
        !("codeChallenge" in grant) ||
        grant.codeChallenge !== challenge
      ) {
        return null;
      }
      redisState.grants.delete(key);
      return stored.value;
    },
  );
});

describe("mobile auth Redis grants", () => {
  it("uses fail-closed per-user and public rate limits", () => {
    expect(RATE_LIMITS["mobile-auth-authorize"]).toMatchObject({
      keyType: "userId",
      failClosedOnStoreError: true,
    });
    expect(RATE_LIMITS["mobile-auth-exchange"]).toMatchObject({
      keyType: "ip",
      failClosedOnStoreError: true,
    });
  });

  it("stores a hashed, deployment-namespaced key for 120 seconds", async () => {
    const code = await issueMobileAuthGrant(USER_ID, createCodeChallenge(VERIFIER));
    const [key] = redisState.grants.keys();

    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(key).toMatch(/^mobile-auth:\{[0-9a-f]{16}\}:grant:[0-9a-f]{64}$/);
    expect(key).not.toContain(code);
    expect(redisState.set).toHaveBeenCalledWith(
      key,
      expect.any(String),
      "EX",
      MOBILE_AUTH_GRANT_TTL_SECONDS,
      "NX",
    );
  });

  it("does not consume a grant for the wrong verifier and rejects replay", async () => {
    const code = await issueMobileAuthGrant(USER_ID, createCodeChallenge(VERIFIER));

    await expect(
      consumeMobileAuthGrant(code, "b".repeat(64)),
    ).resolves.toBeNull();
    await expect(consumeMobileAuthGrant(code, VERIFIER)).resolves.toBe(USER_ID);
    await expect(consumeMobileAuthGrant(code, VERIFIER)).resolves.toBeNull();
  });

  it("rejects an expired grant", async () => {
    const code = await issueMobileAuthGrant(USER_ID, createCodeChallenge(VERIFIER));
    for (const grant of redisState.grants.values()) grant.expiresAt = 0;

    await expect(consumeMobileAuthGrant(code, VERIFIER)).resolves.toBeNull();
  });

  it("fails closed when Redis is unavailable", async () => {
    redisState.ready = false;
    redisState.ensureReady.mockResolvedValue(false);

    await expect(
      issueMobileAuthGrant(USER_ID, createCodeChallenge(VERIFIER)),
    ).rejects.toBeInstanceOf(MobileAuthStoreUnavailableError);
    expect(redisState.set).not.toHaveBeenCalled();
  });
});
