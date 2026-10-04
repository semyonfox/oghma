import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { ensureRedisReady } = vi.hoisted(() => ({
  ensureRedisReady: vi.fn(),
}));

vi.mock("@/database/pgsql", () => ({
  default: vi.fn(),
}));
vi.mock("@/lib/redis", () => ({ ensureRedisReady }));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));

import sql from "@/database/pgsql";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sql).mockReset();
    process.env.DATABASE_URL = "postgresql://localhost:5432/test";
    process.env.QUEUE_PROVIDER = "bullmq";
    delete process.env.HEALTH_CHECK_SECRET;
    ensureRedisReady.mockResolvedValue(true);
    vi.mocked(sql)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ exists: "app.login" }]);
  });

  afterEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.HEALTH_CHECK_SECRET;
    delete process.env.QUEUE_PROVIDER;
  });

  it("returns database failure diagnostics only to authorized monitoring", async () => {
    const databaseError = Object.assign(new Error("database unavailable"), {
      code: "ECONNREFUSED",
    });
    vi.mocked(sql).mockReset().mockRejectedValueOnce(databaseError);
    process.env.HEALTH_CHECK_SECRET = "monitor-secret";

    const response = await GET(new NextRequest("http://localhost/api/health", {
      headers: { "x-health-secret": "monitor-secret" },
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "degraded",
      database: {
        connected: false,
        latencyMs: null,
        loginTableExists: false,
        error: "database unavailable",
        errorCode: "ECONNREFUSED",
        databaseUrlPresent: true,
      },
      chat: { ready: false, databaseReady: false, redisReady: true },
    });
  });

  it("reports a missing database URL without attempting a connection", async () => {
    delete process.env.DATABASE_URL;
    process.env.HEALTH_CHECK_SECRET = "monitor-secret";

    const response = await GET(new NextRequest("http://localhost/api/health", {
      headers: { "x-health-secret": "monitor-secret" },
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "degraded",
      database: {
        connected: false,
        databaseUrlPresent: false,
        databaseUrl: null,
        error: "DATABASE_URL env var missing",
        errorCode: null,
      },
    });
    expect(sql).not.toHaveBeenCalled();
  });

  it.each([undefined, "wrong-secret"])(
    "omits monitoring details when the health secret is %s",
    async (secret) => {
      process.env.HEALTH_CHECK_SECRET = "monitor-secret";
      const headers = secret ? { "x-health-secret": secret } : undefined;

      const response = await GET(
        new NextRequest("http://localhost/api/health", { headers }),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ status: "ok", timestamp: expect.any(String) });
      expect(body).not.toHaveProperty("database");
      expect(body).not.toHaveProperty("rateLimiter");
      expect(body).not.toHaveProperty("chat");
    },
  );

  it("reports a Redis rate-limiter outage as degraded without failing app liveness", async () => {
    ensureRedisReady.mockResolvedValue(false);

    const response = await GET(new NextRequest("http://localhost/api/health"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "degraded" });
  });

  it("exposes authenticated rate-limiter readiness to monitoring", async () => {
    ensureRedisReady.mockResolvedValue(true);
    process.env.HEALTH_CHECK_SECRET = "monitor-secret";

    const response = await GET(new NextRequest("http://localhost/api/health", {
      headers: { "x-health-secret": "monitor-secret" },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      rateLimiter: { redisReady: true, status: "ok" },
      chat: {
        ready: true,
        databaseReady: true,
        redisReady: true,
        queueProvider: "bullmq",
      },
    });
  });

  it("fails chat readiness when Redis is unavailable without changing liveness", async () => {
    ensureRedisReady.mockResolvedValue(false);

    const response = await GET(
      new NextRequest("http://localhost/api/health?readiness=chat"),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "unavailable",
    });
  });

  it("passes chat readiness only for the BullMQ provider", async () => {
    ensureRedisReady.mockResolvedValue(true);
    process.env.QUEUE_PROVIDER = "cloudflare";

    const response = await GET(
      new NextRequest("http://localhost/api/health?readiness=chat"),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "unavailable",
    });
  });

  it("passes chat readiness when Postgres, Redis, and BullMQ are available", async () => {
    ensureRedisReady.mockResolvedValue(true);

    const response = await GET(
      new NextRequest("http://localhost/api/health?readiness=chat"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ok" });
  });
});
