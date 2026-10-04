import { createHash, randomBytes } from "crypto";
import { validateSession } from "@/lib/auth";
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
  session_version: number;
  displayName?: string;
}

interface MobileAuthUserRow {
  user_id: string;
  email: string;
  session_version: number;
  display_name: string | null;
}

interface MobileAuthGrant {
  userId: string;
  codeChallenge: string;
  sessionVersion: number;
}

function isMobileAuthGrant(value: unknown): value is MobileAuthGrant {
  return (
    typeof value === "object" &&
    value !== null &&
    "userId" in value &&
    typeof value.userId === "string" &&
    "codeChallenge" in value &&
    typeof value.codeChallenge === "string" &&
    "sessionVersion" in value && Number.isSafeInteger(value.sessionVersion)
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
    session_version: row.session_version,
    ...(row.display_name ? { displayName: row.display_name } : {}),
  };
}

export async function findActiveMobileAuthUser(
  userId: string,
): Promise<MobileAuthUser | null> {
  if (!isValidUUID(userId)) return null;

  const [user] = await sql<MobileAuthUserRow[]>`
    SELECT user_id, email, display_name, session_version
    FROM app.login
    WHERE user_id = ${userId}::uuid
      AND is_active = true
      AND deleted_at IS NULL
      AND email_verified = true
    LIMIT 1
  `;

  return user ? toMobileAuthUser(user) : null;
}

export async function getActiveAuthJsMobileUser(): Promise<MobileAuthUser | null> {
  const session = await validateSession();
  if (!session) return null;
  const user = await findActiveMobileAuthUser(session.user_id);
  return user?.session_version === session.session_version ? user : null;
}

export const MOBILE_AUTH_CALLBACK = "https://oghmanotes.ie/auth/mobile/callback";

export function androidAppLinkFingerprints(): string[] {
  const values = (process.env.ANDROID_APP_LINK_SHA256_FINGERPRINTS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    !values.length ||
    values.some(
      (value) => !/^(?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/.test(value),
    )
  )
    return [];
  return values.map(value => value.toUpperCase());
}

export function mobileAppLinksReady(): boolean {
  return androidAppLinkFingerprints().length > 0 && process.env.ANDROID_APP_LINKS_VERIFIED === "true";
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
  return `mobile-auth-v2:{${deploymentNamespace()}}:grant:${codeHash}`;
}

async function requireRedis(): Promise<void> {
  if (redisReady || (await ensureRedisReady())) return;
  throw new MobileAuthStoreUnavailableError();
}

export async function issueMobileAuthGrant(
  userId: string,
  codeChallenge: string,
  sessionVersion: number,
): Promise<string> {
  await requireRedis();

  if (!Number.isSafeInteger(sessionVersion)) throw new Error("Session version is required");
  const value = JSON.stringify({ userId, codeChallenge, sessionVersion } satisfies MobileAuthGrant);

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
): Promise<MobileAuthGrant | null> {
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
    return grant;
  } catch {
    return null;
  }
}
