import { createHash, randomBytes } from "crypto";
import { auth } from "@/auth";
import sql from "@/database/pgsql";
import { ensureRedisReady, redis, redisReady } from "@/lib/redis";
import { isValidUUID } from "@/lib/utils/uuid";

export const MOBILE_AUTH_GRANT_TTL_SECONDS = 120;

export const MOBILE_AUTH_STATE_PATTERN = /^[0-9a-f]{64}$/i;
export const MOBILE_AUTH_CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const MOBILE_AUTH_CODE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;

export interface MobileAuthUser {
  user_id: string;
  email: string;
  displayName?: string;
}

interface MobileAuthUserRow {
  user_id: string;
  email: string;
  display_name: string | null;
}

interface MobileAuthGrant {
  userId: string;
  codeChallenge: string;
}

function isMobileAuthGrant(value: unknown): value is MobileAuthGrant {
  return (
    typeof value === "object" &&
    value !== null &&
    "userId" in value &&
    typeof value.userId === "string" &&
    "codeChallenge" in value &&
    typeof value.codeChallenge === "string"
  );
}

export class MobileAuthStoreUnavailableError extends Error {
  constructor() {
    super("Mobile authentication store unavailable");
    this.name = "MobileAuthStoreUnavailableError";
  }
}

function toMobileAuthUser(row: MobileAuthUserRow): MobileAuthUser {
  return {
    user_id: row.user_id,
    email: row.email,
    ...(row.display_name ? { displayName: row.display_name } : {}),
  };
}

export async function findActiveMobileAuthUser(
  userId: string,
): Promise<MobileAuthUser | null> {
  if (!isValidUUID(userId)) return null;

  const [user] = await sql<MobileAuthUserRow[]>`
    SELECT user_id, email, display_name
    FROM app.login
    WHERE user_id = ${userId}::uuid
      AND is_active = true
      AND deleted_at IS NULL
      AND email_verified = true
    LIMIT 1
  `;

  return user ? toMobileAuthUser(user) : null;
}

/**
 * Resolve only the Auth.js browser identity. The custom session cookie must
 * not participate because the browser can hold both cookies for different
 * accounts.
 */
export async function getActiveAuthJsMobileUser(): Promise<MobileAuthUser | null> {
  const session = await auth();
  const userId = session?.user?.id;
  return typeof userId === "string"
    ? findActiveMobileAuthUser(userId)
    : null;
}

export function createCodeChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

function deploymentNamespace(): string {
  const deployment =
    process.env.MOBILE_AUTH_REDIS_NAMESPACE ??
    process.env.DEPLOY_ENV ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    process.env.QUEUE_PREFIX ??
    process.env.NODE_ENV ??
    "development";
  return createHash("sha256").update(deployment).digest("hex").slice(0, 16);
}

function grantKey(code: string): string {
  const codeHash = createHash("sha256").update(code).digest("hex");
  return `mobile-auth:{${deploymentNamespace()}}:grant:${codeHash}`;
}

async function requireRedis(): Promise<void> {
  if (redisReady || (await ensureRedisReady())) return;
  throw new MobileAuthStoreUnavailableError();
}

export async function issueMobileAuthGrant(
  userId: string,
  codeChallenge: string,
): Promise<string> {
  await requireRedis();

  const value = JSON.stringify({ userId, codeChallenge } satisfies MobileAuthGrant);

  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const code = randomBytes(32).toString("base64url");
      const stored = await redis.set(
        grantKey(code),
        value,
        "EX",
        MOBILE_AUTH_GRANT_TTL_SECONDS,
        "NX",
      );
      if (stored === "OK") return code;
    }
  } catch {
    throw new MobileAuthStoreUnavailableError();
  }

  throw new MobileAuthStoreUnavailableError();
}

const CONSUME_GRANT_SCRIPT = `
local value = redis.call("GET", KEYS[1])
if not value then
  return nil
end

local decodedOk, grant = pcall(cjson.decode, value)
if not decodedOk or grant.codeChallenge ~= ARGV[1] then
  return nil
end

redis.call("DEL", KEYS[1])
return value
`;

export async function consumeMobileAuthGrant(
  code: string,
  codeVerifier: string,
): Promise<string | null> {
  await requireRedis();
  const submittedChallenge = createCodeChallenge(codeVerifier);

  let rawGrant: unknown;
  try {
    rawGrant = await redis.eval(
      CONSUME_GRANT_SCRIPT,
      1,
      grantKey(code),
      submittedChallenge,
    );
  } catch {
    throw new MobileAuthStoreUnavailableError();
  }

  if (typeof rawGrant !== "string") return null;

  try {
    const grant: unknown = JSON.parse(rawGrant);
    if (
      !isMobileAuthGrant(grant) ||
      grant.codeChallenge !== submittedChallenge
    ) {
      return null;
    }
    return grant.userId;
  } catch {
    return null;
  }
}
