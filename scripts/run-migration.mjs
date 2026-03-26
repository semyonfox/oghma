#!/usr/bin/env node

// migration runner with --dry-run, --status, and optional file argument
// usage:
//   node scripts/run-migration.mjs                    # runs 017 consolidation
//   node scripts/run-migration.mjs 015-oauth-accounts.sql
//   node scripts/run-migration.mjs --dry-run          # shows SQL without executing
//   node scripts/run-migration.mjs --status            # shows applied vs pending

import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import postgres from 'postgres';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const showStatus = args.includes('--status');
const help = args.includes('--help') || args.includes('-h');
const target = args.find(a => !a.startsWith('--'));

const migrationsDir = resolve('./database/migrations');
const defaultMigration = '017_consolidation_and_fixes.sql';

if (help) {
  console.log(`OghmaNotes migration runner

usage:
  node scripts/run-migration.mjs [options] [migration-file]

options:
  --status     show applied and pending migrations
  --dry-run    print SQL without executing
  --help       show this message

examples:
  node scripts/run-migration.mjs                           # run 017 consolidation
  node scripts/run-migration.mjs --status                  # check migration state
  node scripts/run-migration.mjs --dry-run                 # preview 017 SQL
  node scripts/run-migration.mjs 015-oauth-accounts.sql    # run a specific migration`);
  process.exit(0);
}

const ENV = process.env;

if (!ENV.DATABASE_URL) {
  console.error('error: DATABASE_URL not set');
  console.error('hint: source .env or run with DATABASE_URL=... node scripts/run-migration.mjs');
  process.exit(1);
}

const dbUrl = ENV.DATABASE_URL;
const masked = dbUrl.replace(/:[^@]*@/, ':***@');
const sql = postgres(dbUrl, {
  ssl: dbUrl.includes('localhost') ? false : 'require',
});

async function getApplied() {
  try {
    return await sql`
      SELECT version, name, applied_at
      FROM app.schema_migrations
      ORDER BY version`;
  } catch {
    return [];
  }
}

async function status() {
  console.log('database:', masked);

  const applied = await getApplied();
  const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  const appliedSet = new Set(applied.map(m => m.version));

  if (applied.length === 0) {
    console.log('\nno migration tracking table found');
    console.log('run migration 017 to create it and bring the schema up to date\n');
  } else {
    console.log('\napplied:');
    for (const m of applied) {
      const date = m.applied_at.toISOString().slice(0, 19).replace('T', ' ');
      console.log(`  ${m.version.padEnd(5)} ${m.name.padEnd(35)} ${date}`);
    }
  }

  const pending = files.filter(f => {
    const ver = f.match(/^(\d+)/)?.[1];
    return ver && !appliedSet.has(ver);
  });

  if (pending.length > 0) {
    console.log('\npending:');
    for (const f of pending) console.log(`  ${f}`);
  } else if (applied.length > 0) {
    console.log('\nall migrations applied');
  }
}

async function run(filename) {
  const filepath = resolve(migrationsDir, filename);
  let migrationSQL;

  try {
    migrationSQL = readFileSync(filepath, 'utf-8');
  } catch (err) {
    console.error(`failed to read ${filepath}: ${err.message}`);
    process.exit(1);
  }

  console.log('OghmaNotes migration runner');
  console.log('='.repeat(40));
  console.log('database:', masked);
  console.log('migration:', filename);
  console.log('size:', (migrationSQL.length / 1024).toFixed(1), 'KB\n');

  if (dryRun) {
    console.log('-- DRY RUN: showing SQL that would execute --\n');
    console.log(migrationSQL);
    console.log('\n-- DRY RUN: no changes made --');
    return;
  }

  const start = Date.now();
  console.log('running migration...\n');

  try {
    // wrap in a transaction via postgres.js API
    // (sql.unsafe() rejects explicit BEGIN/COMMIT — use sql.begin() instead)
    await sql.begin(async (tx) => {
      await tx.unsafe(migrationSQL);
    });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\nmigration completed in ${elapsed}s`);

    // show post-migration state
    const tables = await sql`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'app' ORDER BY tablename`;
    console.log('\napp schema tables:', tables.map(t => t.tablename).join(', '));

  } catch (error) {
    console.error('\nmigration failed:');
    console.error(error.message);
    if (error.detail) console.error('detail:', error.detail);
    if (error.hint) console.error('hint:', error.hint);
    if (error.where) console.error('where:', error.where);
    process.exit(1);
  }
}

async function main() {
  try {
    if (showStatus) {
      await status();
    } else {
      await run(target || defaultMigration);
    }
  } finally {
    await sql.end();
  }
}

main();
