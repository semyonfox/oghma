import crypto from "crypto";

/**
 * generates a cryptographically secure random token (256 bits of entropy)
 * returns a 64-char hex string
 */
export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * hashes a raw token using SHA-256
 * used before token storage so a database breach does not expose raw values
 */
export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}
