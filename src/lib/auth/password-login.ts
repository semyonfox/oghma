import bcrypt from "bcryptjs";
import sql from "@/database/pgsql";
import {
  clearFailedAttempts,
  reserveLoginAttempt,
} from "@/lib/auth/login-lockout";

export interface PasswordLoginUser {
  user_id: string;
  email: string;
  session_version: number;
}

export type PasswordLoginResult =
  | { status: "ok"; user: PasswordLoginUser }
  | { status: "rate_limited" }
  | { status: "invalid" }
  | { status: "deactivated" }
  | { status: "unverified"; email: string };

interface PasswordLoginRow extends PasswordLoginUser {
  hashed_password: string;
  email_verified: boolean;
  is_active: boolean;
  deleted_at: Date | null;
}

// same cost as real hashes so an unknown address takes as long as a wrong password
const UNKNOWN_ACCOUNT_HASH =
  "$2b$10$NHO4SyBgH46pieN0gO0PrOho01WrExfYHZAU.KZv1R5fvA2hNohUa";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Shared by the JSON login route and the Auth.js credentials provider so both
 * spend one lockout budget and leak nothing about an account before the
 * password matches. Throws AuthLockoutStoreUnavailableError when the lockout
 * store is down and fail-open is not configured.
 */
export async function authenticatePassword(
  email: string,
  password: string,
): Promise<PasswordLoginResult> {
  const normalized = normalizeEmail(email);
  if (!(await reserveLoginAttempt(normalized))) return { status: "rate_limited" };

  const [user] = await sql<PasswordLoginRow[]>`
    SELECT user_id, email, hashed_password, email_verified, is_active, deleted_at, session_version
    FROM app.login
    WHERE lower(btrim(email)) = ${normalized}
    LIMIT 1
  `;
  const passwordMatches = await bcrypt.compare(
    password,
    user?.hashed_password ?? UNKNOWN_ACCOUNT_HASH,
  );
  if (!user || !passwordMatches) return { status: "invalid" };
  if (!user.is_active || user.deleted_at) return { status: "deactivated" };
  if (user.email_verified !== true) return { status: "unverified", email: user.email };

  await clearFailedAttempts(normalized);
  return {
    status: "ok",
    user: {
      user_id: user.user_id,
      email: user.email,
      session_version: user.session_version,
    },
  };
}
