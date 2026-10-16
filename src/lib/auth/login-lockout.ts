// password login lockout: 5 attempts per 15 min window per normalized email,
// then a 30 min lock. redis is the shared store. a store outage blocks password
// login unless AUTH_LOCKOUT_FAIL_OPEN=true, which falls back to per-process memory

import { ensureRedisReady, redis, redisReady } from "@/lib/redis";
import logger from "@/lib/logger";

const MAX_ATTEMPTS = 5;
const WINDOW_SECS = 15 * 60;
const LOCK_SECS = 30 * 60;
// bounds the fail-open fallback against floods of made-up addresses
const MEMORY_MAX_ENTRIES = 10_000;

const KEY = {
  attempts: (email: string) => `ratelimit:attempts:${email}`,
  window: (email: string) => `ratelimit:window:${email}`,
  lockout: (email: string) => `ratelimit:lockout:${email}`,
};

interface MemoryState {
  count: number;
  windowResetTime: number;
  lockedUntil: number;
}

const memoryState = new Map<string, MemoryState>();

function normalize(email: string): string {
  return email.toLowerCase().trim();
}

export class AuthLockoutStoreUnavailableError extends Error {
  constructor(message = "redis not ready after initialization") {
    super(message);
    this.name = "AuthLockoutStoreUnavailableError";
  }
}

export function isAuthLockoutStoreUnavailableError(
  error: unknown,
): error is AuthLockoutStoreUnavailableError {
  return (
    error instanceof AuthLockoutStoreUnavailableError ||
    (error instanceof Error &&
      error.name === "AuthLockoutStoreUnavailableError")
  );
}

function failOpen(): boolean {
  return process.env.AUTH_LOCKOUT_FAIL_OPEN === "true";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function canUseRedis(): Promise<boolean> {
  try {
    return redisReady || (await ensureRedisReady());
  } catch (err) {
    logger.error("redis rate-limit readiness check failed", {
      fn: "canUseRedis",
      message: errorMessage(err),
    });
    return false;
  }
}

function storeUnavailable(
  fn: string,
  err: unknown = new Error("redis not ready after initialization"),
): AuthLockoutStoreUnavailableError {
  const message = errorMessage(err);
  logger.error("redis auth lockout store unavailable", {
    fn,
    message,
    failOpen: failOpen(),
  });
  return new AuthLockoutStoreUnavailableError(message);
}

// null means "use memory"; throws when memory isn't allowed
async function withStore<T>(
  fn: string,
  redisOperation: () => Promise<T>,
): Promise<T | null> {
  if (await canUseRedis()) {
    try {
      return await redisOperation();
    } catch (err) {
      if (!failOpen()) throw storeUnavailable(fn, err);
      logger.warn("redis lockout store failed, falling back to memory", {
        fn,
        message: errorMessage(err),
      });
      return null;
    }
  }
  if (!failOpen()) throw storeUnavailable(fn);
  return null;
}

const RESERVE_LOGIN_ATTEMPT = `
local now = tonumber(ARGV[1])
local locked = tonumber(redis.call('GET', KEYS[3]) or '0')
if locked > now then return 0 end
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[2])
  redis.call('SET', KEYS[2], now + tonumber(ARGV[2]) * 1000, 'EX', ARGV[2])
end
if count >= tonumber(ARGV[3]) then
  redis.call('SET', KEYS[3], now + tonumber(ARGV[4]) * 1000, 'EX', ARGV[4])
end
if count > tonumber(ARGV[3]) then return 0 end
return 1
`;

function pruneMemory(now: number): void {
  if (memoryState.size < MEMORY_MAX_ENTRIES) return;
  for (const [email, state] of memoryState) {
    if (state.lockedUntil <= now && state.windowResetTime < now) {
      memoryState.delete(email);
    }
  }
}

// mirrors the lua script for the fail-open fallback
function memoryReserve(email: string, now: number): boolean {
  let state = memoryState.get(email);
  if (state && state.lockedUntil > now) return false;
  if (!state || now > state.windowResetTime) {
    pruneMemory(now);
    state = {
      count: 0,
      windowResetTime: now + WINDOW_SECS * 1000,
      lockedUntil: 0,
    };
    memoryState.set(email, state);
  }
  state.count += 1;
  if (state.count >= MAX_ATTEMPTS) state.lockedUntil = now + LOCK_SECS * 1000;
  return state.count <= MAX_ATTEMPTS;
}

/**
 * Count an attempt before bcrypt runs, so concurrent requests and both login
 * paths share one budget. Successful logins clear the count. Returns false
 * when the address is locked.
 */
export async function reserveLoginAttempt(email: string): Promise<boolean> {
  email = normalize(email);
  const now = Date.now();
  const reserved = await withStore("reserveLoginAttempt", async () =>
    (await redis.eval(
      RESERVE_LOGIN_ATTEMPT,
      3,
      KEY.attempts(email),
      KEY.window(email),
      KEY.lockout(email),
      now,
      WINDOW_SECS,
      MAX_ATTEMPTS,
      LOCK_SECS,
    )) === 1,
  );
  return reserved ?? memoryReserve(email, now);
}

export async function clearFailedAttempts(email: string): Promise<void> {
  email = normalize(email);
  try {
    const cleared = await withStore("clearFailedAttempts", async () => {
      await redis.del(KEY.attempts(email), KEY.window(email), KEY.lockout(email));
      return true;
    });
    if (cleared) return;
  } catch {
    // a valid login still succeeds; the stale count expires with its window
    return;
  }
  memoryState.delete(email);
}

export async function getLockoutMinutesRemaining(email: string): Promise<number> {
  email = normalize(email);
  let lockedUntil: number;
  try {
    const stored = await withStore("getLockoutMinutesRemaining", async () =>
      Number((await redis.get(KEY.lockout(email))) ?? 0),
    );
    lockedUntil = stored ?? memoryState.get(email)?.lockedUntil ?? 0;
  } catch {
    return 0;
  }
  const remainingMs = lockedUntil - Date.now();
  return remainingMs > 0 ? Math.ceil(remainingMs / 60_000) : 0;
}
