#!/usr/bin/env node

// migration runner
// usage:
//   node --experimental-strip-types scripts/run-migration.ts --all                 # apply every pending migration
//   node --experimental-strip-types scripts/run-migration.ts --status              # show applied, pending and changed
//   node --experimental-strip-types scripts/run-migration.ts 078_example.sql       # apply one pending migration
//   node --experimental-strip-types scripts/run-migration.ts --all --dry-run       # print pending SQL without executing

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import {
  type AppliedMigration,
  findAppliedMigration,
  findChangedMigrations,
  migrationChecksum,
  migrationId,
  readMigrationFiles,
} from './migration-catalog.ts';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const showStatus = args.includes('--status');
const runAll = args.includes('--all');
const help = args.includes('--help') || args.includes('-h');
const target = args.find(a => !a.startsWith('-'));

const migrationsDir = fileURLToPath(new URL('../database/migrations/', import.meta.url));

// every runner (Jenkins prod, Jenkins dev, a manual run) serialises on this key
// so two deploys never apply the same migration at once
const lockName = 'oghmanotes:schema_migrations';

const usage = `OghmaNotes migration runner

usage:
  node --experimental-strip-types scripts/run-migration.ts [options] [migration-file]

options:
  --all        apply every pending migration in order
  --status     show applied, pending and changed migrations
  --dry-run    print SQL without executing
  --help       show this message

a single migration file only runs when it is still pending`;

class MigrationError extends Error {}

if (help || (!showStatus && !runAll && !target)) {
  console.log(usage);
  process.exit(help ? 0 : 1);
}

if (!process.env.DATABASE_URL) {
  console.error('error: DATABASE_URL not set');
  console.error('hint: source .env or run with DATABASE_URL=... node --experimental-strip-types scripts/run-migration.ts');
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL;
const masked = dbUrl.replace(/:[^@]*@/, ':***@');
// one connection, so the session advisory lock covers every statement below.
// postgres.js reads sslmode from the URL itself
const sql = postgres(dbUrl, { max: 1, onnotice: () => {} });

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorProperty(error: unknown, key: string): unknown {
  return typeof error === 'object' && error !== null && key in error
    ? Reflect.get(error, key)
    : undefined;
}

// migrations run while the previous release is still serving, so they can deadlock
// with a live query or hit their lock_timeout. the transaction rolls back cleanly,
// so those two errors are retried instead of failing the deploy
const LOCK_CONFLICT_CODES = new Set(['40P01', '55P03']);
const LOCK_CONFLICT_ATTEMPTS = 5;

function isLockConflict(error: unknown): boolean {
  const code = errorProperty(error, 'code');
  return typeof code === 'string' && LOCK_CONFLICT_CODES.has(code);
}

interface MigrationRow extends AppliedMigration {
  applied_at: Date;
}

function parseMigrationRow(row: Record<string, unknown>): MigrationRow {
  const { version, name, applied_at: appliedAt, checksum } = row;
  if (typeof version !== 'string' || typeof name !== 'string' || !(appliedAt instanceof Date)) {
    throw new MigrationError('app.schema_migrations has an unexpected row shape');
  }
  return {
    version,
    name,
    applied_at: appliedAt,
    checksum: typeof checksum === 'string' ? checksum : null,
  };
}

async function getApplied(): Promise<MigrationRow[]> {
  // SELECT * keeps --status read-only on databases that predate the checksum column
  const rows = await sql<Record<string, unknown>[]>`
    SELECT * FROM app.schema_migrations ORDER BY version`;
  return rows.map(parseMigrationRow);
}

function readMigration(filename: string): { name: string; contents: string; checksum: string } {
  const contents = readFileSync(resolve(migrationsDir, filename), 'utf-8');
  return { name: filename, contents, checksum: migrationChecksum(contents) };
}

async function ensureTrackingTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS app.schema_migrations (
      version  TEXT PRIMARY KEY,
      name     TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`ALTER TABLE app.schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT`;
}

// rows recorded before checksums existed adopt the current file, so later
// edits to an applied migration are reported instead of silently ignored
async function backfillChecksums(files: string[], applied: MigrationRow[]): Promise<void> {
  for (const filename of files) {
    const row = findAppliedMigration(filename, applied);
    if (!row || row.checksum) continue;
    const { checksum } = readMigration(filename);
    await sql`
      UPDATE app.schema_migrations SET checksum = ${checksum}
      WHERE version = ${row.version} AND checksum IS NULL`;
  }
}

function warnChangedMigrations(files: string[], applied: MigrationRow[]): void {
  const changed = findChangedMigrations(files.map(readMigration), applied);
  for (const name of changed) {
    console.warn(`warning: ${name} changed after it was applied; ship the change as a new migration`);
  }
}

async function status(): Promise<void> {
  console.log('database:', masked);

  let applied: MigrationRow[];
  try {
    applied = await getApplied();
  } catch (error) {
    if (errorProperty(error, 'code') !== '42P01') throw error;
    applied = [];
  }
  const files = readMigrationFiles(migrationsDir);

  if (applied.length === 0) {
    console.log('\nno migration tracking table found');
    console.log('run scripts/prebuild-migrate.ts to adopt the legacy schema and apply migrations\n');
  } else {
    console.log('\napplied:');
    for (const m of applied) {
      const date = m.applied_at.toISOString().slice(0, 19).replace('T', ' ');
      console.log(`  ${m.version.padEnd(5)} ${m.name.padEnd(35)} ${date}`);
    }
  }

  const pending = files.filter(f => !findAppliedMigration(f, applied));
  if (pending.length > 0) {
    console.log('\npending:');
    for (const f of pending) console.log(`  ${f}`);
  } else if (applied.length > 0) {
    console.log('\nall migrations applied');
  }

  const changed = findChangedMigrations(files.map(readMigration), applied);
  if (changed.length > 0) {
    console.log('\nchanged after being applied:');
    for (const name of changed) console.log(`  ${name}`);
  }
}

async function apply(filename: string): Promise<void> {
  const migration = readMigration(filename);

  console.log('migration:', filename);
  console.log('size:', (migration.contents.length / 1024).toFixed(1), 'KB');

  if (dryRun) {
    console.log('-- DRY RUN: showing SQL that would execute --\n');
    console.log(migration.contents);
    console.log('\n-- DRY RUN: no changes made --');
    return;
  }

  const start = Date.now();
  try {
    for (let attempt = 1; ; attempt++) {
      try {
        // sql.unsafe() rejects explicit BEGIN/COMMIT, so the runner owns the
        // transaction: the migration and its tracking row commit together
        await sql.begin(async (tx) => {
          // a migration blocked behind a live query also blocks every query queued after
          // it, so fail fast and retry. a migration's own SET LOCAL overrides this
          await tx.unsafe("SET LOCAL lock_timeout = '3s'");
          await tx.unsafe(migration.contents);
          await tx`
            INSERT INTO app.schema_migrations (version, name, checksum)
            VALUES (${migrationId(filename)}, ${filename}, ${migration.checksum})
          `;
        });
        break;
      } catch (error) {
        if (!isLockConflict(error) || attempt === LOCK_CONFLICT_ATTEMPTS) throw error;
        const delaySeconds = attempt * 2;
        console.warn(`lock conflict (${errorMessage(error)}), retrying in ${delaySeconds}s (${attempt}/${LOCK_CONFLICT_ATTEMPTS})`);
        await new Promise(resolveDelay => setTimeout(resolveDelay, delaySeconds * 1000));
      }
    }
  } catch (error) {
    const details = ['detail', 'hint', 'where']
      .map(key => [key, errorProperty(error, key)] as const)
      .filter(([, value]) => value)
      .map(([key, value]) => `\n${key}: ${String(value)}`)
      .join('');
    throw new MigrationError(`${filename} failed and was rolled back: ${errorMessage(error)}${details}`);
  }
  console.log(`applied in ${((Date.now() - start) / 1000).toFixed(1)}s\n`);
}

async function migrate(): Promise<void> {
  console.log('OghmaNotes migration runner');
  console.log('database:', masked);

  const files = readMigrationFiles(migrationsDir);
  if (target && !files.includes(target)) {
    throw new MigrationError(`unknown migration ${target}; expected a file in database/migrations`);
  }

  if (!dryRun) {
    await sql`SELECT pg_advisory_lock(hashtext(${lockName}))`;
    await ensureTrackingTable();
  }

  // read after taking the lock so a runner that waited sees what the other applied
  let applied: MigrationRow[];
  try {
    applied = await getApplied();
  } catch (error) {
    if (!dryRun || errorProperty(error, 'code') !== '42P01') throw error;
    applied = [];
  }

  if (!dryRun) {
    await backfillChecksums(files, applied);
    applied = await getApplied();
  }
  warnChangedMigrations(files, applied);

  const pending = files.filter(f => !findAppliedMigration(f, applied));
  if (target) {
    if (!pending.includes(target)) {
      throw new MigrationError(`${target} is already applied; ship schema changes as a new migration`);
    }
    await apply(target);
    return;
  }

  if (pending.length === 0) {
    console.log('all migrations already applied');
    return;
  }

  console.log(`running ${pending.length} pending migration(s)...\n`);
  for (const f of pending) await apply(f);
}

try {
  if (showStatus) await status();
  else await migrate();
} catch (error) {
  console.error(`\nmigration failed: ${errorMessage(error)}`);
  process.exitCode = 1;
} finally {
  // closing the session also releases the advisory lock
  await sql.end();
}
