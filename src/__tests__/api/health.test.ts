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
    process.env.DATABASE_URL = "postgresql://localhost:5432/test";
    process.env.QUEUE_PROVIDER = "bullmq";
    delete process.env.HEALTH_CHECK_SECRET;
    vi.mocked(sql)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ exists: "app.login" }]);
  });

  afterEach(() => {
    delete process.env.HEALTH_CHECK_SECRET;
    delete process.env.QUEUE_PROVIDER;
  });

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
