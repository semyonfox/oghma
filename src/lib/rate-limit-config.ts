// centralized rate limit definitions for all protected endpoints
// keyType documents what identifier callers pass: userId (session), ip (getClientIp), or email (body field)
//
// when Redis is down a rule either fails open to a per-process in-memory window
// (fine for cost and abuse limits on signed-in users, where a short outage only
// loosens limits per app instance) or fails closed with a 503 (security flows
// where an attacker could otherwise wait out an outage). pick deliberately

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

export const RATE_LIMITS = {
  // tier 1 — expensive external API calls
  'chat':           { limit: 120, windowSeconds: 3600,  keyType: 'userId' },
  // presence heartbeats fire every ~10s per open tab plus visibility events
  'chat-presence':  { limit: 1200, windowSeconds: 3600, keyType: 'userId' },
  'chat-cancel':    { limit: 120, windowSeconds: 3600,  keyType: 'userId' },
  'extract':        { limit: 10,  windowSeconds: 3600,  keyType: 'userId' },
  'canvas-connect': { limit: 10,  windowSeconds: 3600,  keyType: 'userId' },
  // each semantic query is a paid embedding call, budgeted apart from the search palette
  'semantic-search': { limit: 120, windowSeconds: 3600, keyType: 'userId' },

  // tier 2 — auth security (public endpoints)
  // per-ip cap on top of the per-email lockout so one address can't spray many
  // accounts. AUTH_LOCKOUT_FAIL_OPEN is the operator's switch to keep password
  // login up through a Redis outage, so this cap follows it instead of undoing it.
  // loose on purpose: a whole campus can sit behind one eduroam NAT address
  'login':          { limit: 100, windowSeconds: 900,   keyType: 'ip',    failClosedOnStoreError: process.env.AUTH_LOCKOUT_FAIL_OPEN !== 'true' },
  'register':       { limit: 5,   windowSeconds: 3600,  keyType: 'ip',    failClosedOnStoreError: true },
  'password-reset': { limit: 3,   windowSeconds: 3600,  keyType: 'email', failClosedOnStoreError: true },
  'password-reset-ip': { limit: 10, windowSeconds: 3600, keyType: 'ip',   failClosedOnStoreError: true },
  'password-verify':{ limit: 10,  windowSeconds: 3600,  keyType: 'ip',    failClosedOnStoreError: true },
  'change-password': { limit: 3, windowSeconds: 3600, keyType: 'userId', failClosedOnStoreError: true },
  'resend-verification': { limit: 3,  windowSeconds: 3600, keyType: 'email', failClosedOnStoreError: true },
  'resend-verification-ip': { limit: 10, windowSeconds: 3600, keyType: 'ip', failClosedOnStoreError: true },
  'verify-email':   { limit: 10,  windowSeconds: 3600,  keyType: 'ip',    failClosedOnStoreError: true },
  'agent-registration': { limit: 3, windowSeconds: 3600, keyType: 'ip', failClosedOnStoreError: true },
  'agent-registration-claim': { limit: 60, windowSeconds: 3600, keyType: 'ip', failClosedOnStoreError: true },
  'mobile-auth-authorize': { limit: 10, windowSeconds: 600, keyType: 'userId', failClosedOnStoreError: true },
  'mobile-auth-exchange': { limit: 30, windowSeconds: 600, keyType: 'ip', failClosedOnStoreError: true },

  // tier 3 — resource protection
  'upload':         { limit: 30,  windowSeconds: 3600,  keyType: 'userId' },
  'avatar-upload':  { limit: 10,  windowSeconds: 3600,  keyType: 'userId', failClosedOnStoreError: true },
  'vault-delete':   { limit: 1,   windowSeconds: 86400, keyType: 'userId', failClosedOnStoreError: true },
  'contact':        { limit: 5,   windowSeconds: 3600,  keyType: 'ip' },
  'share':          { limit: 10,  windowSeconds: 3600,  keyType: 'userId' },
  'global-search':  { limit: 120, windowSeconds: 3600,  keyType: 'userId' },
  // anonymous product events. fail open: losing a few counts in an outage is fine
  'telemetry':      { limit: 60,  windowSeconds: 60,    keyType: 'ip', failClosedOnStoreError: false },
} satisfies Record<string, RateLimitRule>;

// typed so a misspelt category fails typecheck instead of silently skipping the limit
export type RateLimitCategory = keyof typeof RATE_LIMITS;
