// centralized rate limit definitions for all protected endpoints
// keyType determines what identifier is used: userId (session), ip (request header), or email (body field)

export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
  keyType: 'userId' | 'ip' | 'email';
  /**
   * When true, Redis/store errors block the protected action instead of using
   * the per-process in-memory fallback. Use this for security-sensitive flows
   * where fail-open behavior can weaken abuse protection across app instances.
   */
  failClosedOnStoreError?: boolean;
}

export const RATE_LIMITS: Record<string, RateLimitRule> = {
  // tier 1 — expensive external API calls
  'chat':           { limit: 120, windowSeconds: 3600,  keyType: 'userId' },
  'extract':        { limit: 10,  windowSeconds: 3600,  keyType: 'userId' },
  'canvas-connect': { limit: 10,  windowSeconds: 3600,  keyType: 'userId' },

  // tier 2 — auth security (public endpoints)
  'register':       { limit: 5,   windowSeconds: 3600,  keyType: 'ip',    failClosedOnStoreError: true },
  'password-reset': { limit: 3,   windowSeconds: 3600,  keyType: 'email', failClosedOnStoreError: true },
  'password-verify':{ limit: 10,  windowSeconds: 3600,  keyType: 'ip',    failClosedOnStoreError: true },
  'resend-verification': { limit: 3,  windowSeconds: 3600, keyType: 'email', failClosedOnStoreError: true },
  'verify-email':   { limit: 10,  windowSeconds: 3600,  keyType: 'ip',    failClosedOnStoreError: true },
  'agent-registration': { limit: 3, windowSeconds: 3600, keyType: 'ip', failClosedOnStoreError: true },
  'agent-registration-claim': { limit: 60, windowSeconds: 3600, keyType: 'ip', failClosedOnStoreError: true },

  // tier 3 — resource protection
  'upload':         { limit: 30,  windowSeconds: 3600,  keyType: 'userId' },
  'vault-delete':   { limit: 1,   windowSeconds: 86400, keyType: 'userId', failClosedOnStoreError: true },
  'contact':        { limit: 5,   windowSeconds: 3600,  keyType: 'ip' },
  'share':          { limit: 10,  windowSeconds: 3600,  keyType: 'userId' },
  'global-search':  { limit: 120, windowSeconds: 3600,  keyType: 'userId' },
};
