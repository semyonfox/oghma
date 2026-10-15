import crypto from "node:crypto";

// lazy — defer the check to first use so next build can collect page data
// without requiring the secret at module evaluation time
function getServerSecret(): string {
  const secret = process.env.SERVER_ENCRYPTION_SECRET;
  if (secret) return secret;
  throw new Error(
    "SERVER_ENCRYPTION_SECRET must be set — generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  );
}

// pbkdf2Sync at 100k rounds blocks the event loop for tens of ms or more, and every
// Canvas request decrypts the user's token. the derived key is deterministic,
// so keep recent ones; the secret is part of the entry so rotation can't reuse a stale key
const MAX_CACHED_KEYS = 1_000;
const derivedKeys = new Map<string, { secret: string; key: Buffer }>();

function deriveKey(userId: string): Buffer {
  const secret = getServerSecret();
  const cached = derivedKeys.get(userId);
  if (cached?.secret === secret) {
    // refresh insertion order so the eviction below drops the least recently used key
    derivedKeys.delete(userId);
    derivedKeys.set(userId, cached);
    return cached.key;
  }
  const key = crypto.pbkdf2Sync(secret, userId, 100_000, 32, "sha256");
  derivedKeys.set(userId, { secret, key });
  if (derivedKeys.size > MAX_CACHED_KEYS) {
    const oldest = derivedKeys.keys().next().value;
    if (oldest !== undefined) derivedKeys.delete(oldest);
  }
  return key;
}

export function encrypt(plaintext: string, userId: string): string {
  const key = deriveKey(userId);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decrypt(ciphertext: string, userId: string): string {
  const key = deriveKey(userId);
  const buf = Buffer.from(ciphertext, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
}
