#!/usr/bin/env node

// runs pending migrations before build using a dedicated migrator role
// pulls credentials from Secrets Manager, never touches env or disk
// used via amplify.yml build phase

import { execSync } from 'child_process';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import postgres from 'postgres';

const MIGRATOR_SECRET = process.env.MIGRATOR_SECRET_ID || 'oghmanotes/migrator';
const AWS_REGION = process.env.AWS_REGION || 'eu-west-1';

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

async function getMigratorUrl() {
  // prefer explicit env var for local dev / testing
  if (process.env.MIGRATION_DATABASE_URL) {
    return process.env.MIGRATION_DATABASE_URL;
  }

  // pull from Secrets Manager (Amplify build role has access)
  try {
    const client = new SecretsManagerClient({ region: AWS_REGION });
    const res = await client.send(new GetSecretValueCommand({ SecretId: MIGRATOR_SECRET }));
    if (!res.SecretString) return null;

    const secret = JSON.parse(res.SecretString);
    // support both { url: "postgres://..." } and { host, port, username, password, dbname }
    if (secret.url || secret.DATABASE_URL || secret.database_url) {
      return secret.url || secret.DATABASE_URL || secret.database_url;
    }
    if (secret.host && secret.username && secret.password) {
      const db = secret.dbname || secret.database || 'oghma';
      const port = secret.port || 5432;
      return `postgresql://${secret.username}:${encodeURIComponent(secret.password)}@${secret.host}:${port}/${db}?sslmode=require&search_path=app`;
    }
    return null;
  } catch (err) {
    console.warn(`[prebuild-migrate] could not fetch secret ${MIGRATOR_SECRET}:`, err.message);
    return null;
  }
}

async function bootstrap(dbUrl) {
  const sql = postgres(dbUrl, {
    ssl: dbUrl.includes('localhost') ? false : 'require',
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
  const dbUrl = await getMigratorUrl();
  if (!dbUrl) {
    console.log('[prebuild-migrate] no migrator credentials available, skipping');
    process.exit(0);
  }

  console.log('[prebuild-migrate] running pending migrations...');
  await bootstrap(dbUrl);

  // pass the migrator URL to run-migration.mjs via env
  execSync('node scripts/run-migration.mjs --all', {
    stdio: 'inherit',
    timeout: 60000,
    env: { ...process.env, DATABASE_URL: dbUrl },
  });
  console.log('[prebuild-migrate] done');
} catch (err) {
  console.warn('[prebuild-migrate] migrations failed, continuing build:', err.message);
}
