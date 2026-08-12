#!/usr/bin/env node

// runs pending migrations before the app starts
// homelab passes MIGRATION_DATABASE_URL via Jenkins env file (oghma_admin role)

import { execFileSync } from "node:child_process";
import postgres from "postgres";

// migrations applied before the tracking system existed
const LEGACY_MIGRATIONS = [
  "001_schema_migrations.sql",
  "002_oauth_accounts.sql",
  "003_quiz_session_card_ids.sql",
  "005_vault_job_columns.sql",
  "006_canvas_imports_unique.sql",
  "007_quiz_session_card_ids_invariants.sql",
  "008_rag_tables_consolidation.sql",
  "009_quiz_infrastructure.sql",
  "010_embeddings_vector_4096.sql",
  "011_two_phase_import.sql",
  "012_backfill_file_note_canvas_meta.sql",
  "013_chat_session_context.sql",
  "014_embeddings_openrouter_4096.sql",
  "015_dedup_root_notes.sql",
  "016_tree_items_unique.sql",
  "017_user_course_settings.sql",
] as const;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function bootstrap(dbUrl: string): Promise<void> {
  const sql = postgres(dbUrl, {
    ssl: dbUrl.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : false,
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
      if (!version) throw new Error(`invalid legacy migration name: ${name}`);
      await sql`
        INSERT INTO app.schema_migrations (version, name)
        VALUES (${version}, ${name})
        ON CONFLICT (version) DO NOTHING
      `;
    }
  } catch (err: unknown) {
    console.warn("[prebuild-migrate] bootstrap failed:", errorMessage(err));
  } finally {
    await sql.end();
  }
}

try {
  const dbUrl = process.env.MIGRATION_DATABASE_URL;
  if (!dbUrl) {
    throw new Error("MIGRATION_DATABASE_URL is required");
  }

  console.log("[prebuild-migrate] running pending migrations...");
  await bootstrap(dbUrl);

  execFileSync(
    process.execPath,
    ["--experimental-strip-types", "scripts/migrate-pgvector-to-qdrant.ts"],
    {
      stdio: "inherit",
      timeout: 300000,
      env: { ...process.env, DATABASE_URL: dbUrl },
    },
  );

  execFileSync(
    process.execPath,
    ["--experimental-strip-types", "scripts/run-migration.ts", "--all"],
    {
      stdio: "inherit",
      timeout: 60000,
      env: { ...process.env, DATABASE_URL: dbUrl },
    },
  );
  console.log("[prebuild-migrate] done");
} catch (err: unknown) {
  console.error("[prebuild-migrate] migrations failed:", errorMessage(err));
  process.exit(1);
}
