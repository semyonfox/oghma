import crypto from 'node:crypto';

// lazy — defer the check to first use so next build can collect page data
// without requiring the secret at module evaluation time
function getServerSecret(): string {
  const secret = process.env.SERVER_ENCRYPTION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production' && typeof window === 'undefined') {
    throw new Error('SERVER_ENCRYPTION_SECRET must be set in production');
  }
  return 'dev-secret-do-not-use-in-prod';
}

function deriveKey(userId: string): Buffer {
  return crypto.pbkdf2Sync(getServerSecret(), userId, 100_000, 32, 'sha256');
}

export function encrypt(plaintext: string, userId: string): string {
  const key = deriveKey(userId);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decrypt(ciphertext: string, userId: string): string {
  const key = deriveKey(userId);
  const buf = Buffer.from(ciphertext, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
}
