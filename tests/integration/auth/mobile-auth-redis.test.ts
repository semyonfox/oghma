import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash, randomUUID } from "crypto";
import IORedis from "ioredis";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/database/pgsql", () => ({ default: vi.fn() }));

import {
  MOBILE_AUTH_GRANT_TTL_SECONDS,
  consumeMobileAuthGrant,
  createCodeChallenge,
  issueMobileAuthGrant,
} from "@/lib/mobile-auth";
import { redis } from "@/lib/redis";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const VERIFIER = "a".repeat(64);
let control: IORedis;
let grantKeyPattern: string;

beforeAll(async () => {
  const host = process.env.REDIS_HOST;
  const port = Number(process.env.REDIS_PORT);
  if ((host !== "127.0.0.1" && host !== "localhost") || port !== 56380) {
    throw new Error("Mobile auth integration tests require disposable Redis on 127.0.0.1:56380");
  }

  process.env.MOBILE_AUTH_REDIS_NAMESPACE = `integration-${randomUUID()}`;
  const namespaceHash = createHash("sha256")
    .update(process.env.MOBILE_AUTH_REDIS_NAMESPACE)
    .digest("hex")
    .slice(0, 16);
  grantKeyPattern = `mobile-auth:{${namespaceHash}}:grant:*`;

  control = new IORedis({ host, port, maxRetriesPerRequest: 1 });
  await control.ping();
});

afterAll(async () => {
  if (!control) return;
  const keys = await control.keys(grantKeyPattern);
  if (keys.length > 0) await control.del(...keys);
  control.disconnect();
  redis.disconnect();
  delete process.env.MOBILE_AUTH_REDIS_NAMESPACE;
});

describe("mobile auth grants in disposable Redis", () => {
  it("keeps a wrong-verifier grant, then atomically consumes it once", async () => {
    const code = await issueMobileAuthGrant(USER_ID, createCodeChallenge(VERIFIER));

    await expect(
      consumeMobileAuthGrant(code, "b".repeat(64)),
    ).resolves.toBeNull();
    await expect(consumeMobileAuthGrant(code, VERIFIER)).resolves.toBe(USER_ID);
    await expect(consumeMobileAuthGrant(code, VERIFIER)).resolves.toBeNull();
  });

  it("sets the fixed TTL and rejects an expired grant", async () => {
    const code = await issueMobileAuthGrant(USER_ID, createCodeChallenge(VERIFIER));
    const [key] = await control.keys(grantKeyPattern);

    expect(key).toBeDefined();
    expect(await control.ttl(key)).toBeGreaterThanOrEqual(
      MOBILE_AUTH_GRANT_TTL_SECONDS - 1,
    );

    await control.pexpire(key, 1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await expect(consumeMobileAuthGrant(code, VERIFIER)).resolves.toBeNull();
  });
});
