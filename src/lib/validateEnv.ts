// validates required environment variables at server startup
// called from instrumentation.ts so missing vars surface immediately, not at request time

const REQUIRED = [
  'DATABASE_URL',
  'JWT_SECRET',
  'STORAGE_BUCKET',
  'STORAGE_REGION',
];

const REQUIRED_PROD = [
  'SERVER_ENCRYPTION_SECRET',
];

export function validateEnv() {
  const missing = REQUIRED.filter(k => !process.env[k]);
  if (process.env.NODE_ENV === 'production') {
    missing.push(...REQUIRED_PROD.filter(k => !process.env[k]));
  }
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
