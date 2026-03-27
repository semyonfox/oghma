import crypto from 'crypto';

/**
 * generates a cryptographically secure random token (256 bits of entropy)
 * returns a 64-char hex string
 */
export function generateSecureToken() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * hashes a raw token using SHA-256
 * used before storing tokens in the database so a DB breach doesn't expose raw values
 */
export function hashToken(rawToken) {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * verifies a raw token against a stored hash
 * hashes the raw token and compares to the stored value
 */
export function verifyTokenHash(rawToken, storedHash) {
    return hashToken(rawToken) === storedHash;
}
