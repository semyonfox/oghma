// centralized rate limit definitions for all protected endpoints
// keyType determines what identifier is used: userId (session), ip (request header), or email (body field)

export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
  keyType: 'userId' | 'ip' | 'email';
}

export const RATE_LIMITS: Record<string, RateLimitRule> = {
  // tier 1 — expensive external API calls
  'chat':           { limit: 120, windowSeconds: 3600,  keyType: 'userId' },
  'extract':        { limit: 10,  windowSeconds: 3600,  keyType: 'userId' },

  // tier 2 — auth security (public endpoints)
  'register':       { limit: 5,   windowSeconds: 3600,  keyType: 'ip' },
  'password-reset': { limit: 3,   windowSeconds: 3600,  keyType: 'email' },
  'password-verify':{ limit: 10,  windowSeconds: 3600,  keyType: 'ip' },

  // tier 3 — resource protection
  'upload':         { limit: 30,  windowSeconds: 3600,  keyType: 'userId' },
  'vault-delete':   { limit: 1,   windowSeconds: 86400, keyType: 'userId' },
  'contact':        { limit: 5,   windowSeconds: 3600,  keyType: 'ip' },
  'share':          { limit: 10,  windowSeconds: 3600,  keyType: 'userId' },
};
