// Creates a schema only in an empty, explicitly named loopback audit database.
import postgres from 'postgres';
import { readFile } from 'node:fs/promises';
import { MIGRATION_SQL } from './standalone-migration.ts';
import { applyCurrentSchemaPatch } from './e2e/legacy-schema.ts';
import { readMigrationFiles, migrationVersion, migrationId } from './migration-catalog.ts';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL required');
const parsed = new URL(url);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) ||
    !parsed.pathname.endsWith('_audit_e2e')) throw new Error('Requires a loopback *_audit_e2e database');
const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  const [existing] = await sql`SELECT to_regnamespace('app') AS schema`;
  if (existing.schema) throw new Error('Refusing to overwrite an existing app schema');
  await sql.unsafe(MIGRATION_SQL);
  await applyCurrentSchemaPatch(sql);
  if (process.argv.includes('--legacy-index-shape')) {
    await sql`DROP INDEX app.idx_notes_user_active`;
    await sql`CREATE INDEX idx_notes_user_active ON app.notes (user_id) WHERE deleted_at IS NULL`;
  }
  await sql`CREATE TABLE app.schema_migrations (version TEXT PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  for (const name of readMigrationFiles(new URL('../database/migrations', import.meta.url))) {
    const version = migrationVersion(name);
    if (!version) throw new Error(`Invalid migration ${name}`);
    const legacy = Number(version) <= 17;
    await sql.begin(async tx => {
      if (!legacy) await tx.unsafe(await readFile(new URL(`../database/migrations/${name}`, import.meta.url), 'utf8'));
      await tx`INSERT INTO app.schema_migrations (version, name) VALUES (${legacy ? version : migrationId(name)}, ${name})`;
    });
  }
  console.log('Empty audit database initialized with baseline and canonical migrations.');
} finally {
  await sql.end();
}
