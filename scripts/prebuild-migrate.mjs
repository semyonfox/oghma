#!/usr/bin/env node

// runs pending migrations before the app starts
// homelab passes MIGRATION_DATABASE_URL via Jenkins env file (oghma_admin role)

import { execSync } from 'child_process';
import postgres from 'postgres';

// migrations applied before the tracking system existed
const LEGACY_MIGRATIONS = [
  '001_schema_migrations.sql',
  '002_oauth_accounts.sql',
  '003_quiz_session_card_ids.sql',
  '005_vault_job_columns.sql',
  '006_canvas_imports_unique.sql',
  '007_quiz_session_card_ids_invariants.sql',
  '008_rag_tables_consolidation.sql',
  '009_quiz_infrastructure.sql',
  '010_embeddings_vector_4096.sql',
  '011_two_phase_import.sql',
  '012_backfill_file_note_canvas_meta.sql',
  '013_chat_session_context.sql',
  '014_embeddings_openrouter_4096.sql',
  '015_dedup_root_notes.sql',
  '016_tree_items_unique.sql',
  '017_user_course_settings.sql',
];

async function bootstrap(dbUrl) {
  const sql = postgres(dbUrl, {
    ssl: dbUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
    connect_timeout: 10,
    idle_timeout: 5,
  });

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS app.schema_migrations (
        version  TEXT PRIMARY KEY,
        name     TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    for (const name of LEGACY_MIGRATIONS) {
      const version = name.match(/^(\d+)/)?.[1];
      await sql`
        INSERT INTO app.schema_migrations (version, name)
        VALUES (${version}, ${name})
        ON CONFLICT (version) DO NOTHING
      `;
    }
  } catch (err) {
    console.warn('[prebuild-migrate] bootstrap failed:', err.message);
  } finally {
    await sql.end();
  }
}

try {
  const dbUrl = process.env.MIGRATION_DATABASE_URL;
  if (!dbUrl) {
    console.log('[prebuild-migrate] MIGRATION_DATABASE_URL not set, skipping');
    process.exit(0);
  }

  console.log('[prebuild-migrate] running pending migrations...');
  await bootstrap(dbUrl);

  execSync('node scripts/run-migration.mjs --all', {
    stdio: 'inherit',
    timeout: 60000,
    env: { ...process.env, DATABASE_URL: dbUrl },
  });
  console.log('[prebuild-migrate] done');
} catch (err) {
  console.warn('[prebuild-migrate] migrations failed, continuing build:', err.message);
}
