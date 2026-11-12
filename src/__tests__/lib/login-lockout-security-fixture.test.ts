import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { reserveLoginAttempt, clearFailedAttempts, getLockoutMinutesRemaining } from "@/lib/auth/login-lockout";
import { redis } from "@/lib/redis";

const CLIENT = "203.0.113.10";

const fixture = process.env.SECURITY_FIXTURE_REDIS === "1";
const email = "synthetic-security-lockout@example.test";
beforeAll(async () => {
  if (!fixture) return;
  if (
    process.env.REDIS_HOST !== "127.0.0.1" ||
    process.env.REDIS_PORT !== "57480"
  )
    throw new Error("Disposable security Redis required");
  await clearFailedAttempts(email, CLIENT);
});
afterAll(async () => {
  if (fixture) {
    await clearFailedAttempts(email, CLIENT);
    await redis.quit();
  }
});
describe.skipIf(!fixture)(
  "atomic login reservation in disposable Redis",
  () => {
    it("limits concurrent attempts before bcrypt and shares normalized account keys", async () => {
      const attempts = await Promise.all(
        Array.from({ length: 30 }, (_, index) =>
          reserveLoginAttempt(index % 2 ? ` ${email.toUpperCase()} ` : email, CLIENT),
        ),
      );
      expect(attempts.filter(Boolean)).toHaveLength(5);
      expect(await reserveLoginAttempt(email, CLIENT)).toBe(false);
      expect(await getLockoutMinutesRemaining(email, CLIENT)).toBe(30);
      // another client is unaffected by this one's lock
      expect(await reserveLoginAttempt(email, "198.51.100.20")).toBe(true);
      await clearFailedAttempts(email, "198.51.100.20");
      await clearFailedAttempts(email, CLIENT);
      expect(await reserveLoginAttempt(email, CLIENT)).toBe(true);
    });
  },
);
