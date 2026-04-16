#!/usr/bin/env node

// runs pending migrations before build, skips gracefully if DB is unreachable
// used as npm prebuild hook so Amplify auto-applies migrations on deploy

import { execSync } from 'child_process';

if (!process.env.DATABASE_URL) {
  console.log('[prebuild-migrate] DATABASE_URL not set, skipping migrations');
  process.exit(0);
}

try {
  console.log('[prebuild-migrate] running pending migrations...');
  execSync('node scripts/run-migration.mjs --all', { stdio: 'inherit', timeout: 60000 });
  console.log('[prebuild-migrate] done');
} catch (err) {
  console.warn('[prebuild-migrate] migrations failed, continuing build:', err.message);
}
