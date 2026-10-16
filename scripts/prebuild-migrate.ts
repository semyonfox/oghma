#!/usr/bin/env node

// runs pending migrations before the app starts
// homelab passes MIGRATION_DATABASE_URL via Jenkins env file (oghma_admin role)

import { execFileSync } from "node:child_process";
import postgres from "postgres";
import { assertLegacySchema } from "./legacy-schema-contract.ts";
import {
  isLegacyMigration,
  migrationVersion,
  readMigrationFiles,
} from "./migration-catalog.ts";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function bootstrap(dbUrl: string): Promise<void> {
  // postgres.js reads sslmode from the URL itself
  const sql = postgres(dbUrl, { connect_timeout: 10, idle_timeout: 5 });
  const legacyMigrations = readMigrationFiles(
    new URL("../database/migrations/", import.meta.url),
  ).filter(isLegacyMigration);

  try {
    await assertLegacySchema(sql);
    await sql`
      CREATE TABLE IF NOT EXISTS app.schema_migrations (
        version  TEXT PRIMARY KEY,
        name     TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    // these predate the tracking table and keep their numeric identity
    for (const name of legacyMigrations) {
      const version = migrationVersion(name);
      if (!version) throw new Error(`invalid legacy migration name: ${name}`);
      await sql`
        INSERT INTO app.schema_migrations (version, name)
        VALUES (${version}, ${name})
        ON CONFLICT (version) DO NOTHING
      `;
    }
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
      // leaves room for lock-conflict retries in run-migration.ts
      timeout: 300000,
      env: { ...process.env, DATABASE_URL: dbUrl },
    },
  );
  console.log("[prebuild-migrate] done");
} catch (err: unknown) {
  console.error("[prebuild-migrate] migrations failed:", errorMessage(err));
  process.exit(1);
}
