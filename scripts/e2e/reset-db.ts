#!/usr/bin/env node

import bcrypt from "bcryptjs";
import { applyCurrentSchemaPatch } from "./legacy-schema.ts";
import IORedis from "ioredis";
import postgres from "postgres";
import { randomUUID } from "crypto";
import { readFile } from "fs/promises";
import {
  migrationId,
  migrationVersion,
  readMigrationFiles,
} from "../migration-catalog.ts";
import { loadE2EEnvFiles } from "./lib/env.ts";

loadE2EEnvFiles();

const databaseUrl = process.env.DATABASE_URL || process.env.E2E_DATABASE_URL;
const seedEmail = process.env.E2E_SEED_USER_EMAIL || "student.e2e@example.com";
const seedPassword = process.env.E2E_SEED_USER_PASSWORD || "E2ePassword123!";
const seedUserId =
  process.env.E2E_SEED_USER_ID || "11111111-1111-4111-8111-111111111111";
const qdrantCollection = process.env.QDRANT_COLLECTION || "oghma_e2e_chunks";
const standaloneMigrationModule = "../standalone-migration.ts";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function loadStandaloneMigrationSql(): Promise<string> {
  // Validate the imported snapshot at its dynamic-module boundary. E2E resets
  // deliberately reuse this destructive baseline only after the URL guards.
  const module: unknown = await import(standaloneMigrationModule);
  if (
    typeof module !== "object" ||
    module === null ||
    !("MIGRATION_SQL" in module) ||
    typeof module.MIGRATION_SQL !== "string"
  ) {
    throw new Error("standalone migration must export MIGRATION_SQL as a string");
  }
  return module.MIGRATION_SQL;
}

function assertSafeDatabaseUrl(dbUrl: string | undefined): asserts dbUrl is string {
  if (!dbUrl) {
    throw new Error("DATABASE_URL or E2E_DATABASE_URL is required");
  }

  const parsed = new URL(dbUrl);
  const dbName = parsed.pathname.replace(/^\//, "");
  const host = parsed.hostname;
  const looksLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "postgres" ||
    host.endsWith(".local");

  if (!dbName.includes("e2e")) {
    throw new Error(
      `Refusing to reset database '${dbName}'. E2E database names must include 'e2e'.`,
    );
  }

  if (!looksLocal && process.env.E2E_ALLOW_NONLOCAL_DB_RESET !== "1") {
    throw new Error(
      `Refusing to reset non-local database host '${host}'. Set E2E_ALLOW_NONLOCAL_DB_RESET=1 only for disposable CI services.`,
    );
  }
}

async function applyCanonicalMigrations(sql: postgres.Sql): Promise<void> {
  // The standalone snapshot plus applyCurrentSchemaPatch form the legacy E2E
  // bootstrap. Every later schema change must come from the checked-in
  // canonical migration catalog.
  const catalog = readMigrationFiles(
    new URL("../../database/migrations", import.meta.url),
  );
  await sql`
    CREATE TABLE IF NOT EXISTS app.schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // The snapshot already contains this legacy schema. Record those filenames
  // with their historical numeric identities, just as production bootstrap
  // does, then exercise the current full-filename identity for later files.
  for (const migration of catalog.filter(
    (filename) => Number(migrationVersion(filename)) <= 17,
  )) {
    const version = migrationVersion(migration);
    if (!version) throw new Error(`Invalid migration filename: ${migration}`);
    await sql`
      INSERT INTO app.schema_migrations (version, name)
      VALUES (${version}, ${migration})
      ON CONFLICT (version) DO NOTHING
    `;
  }

  const migrations = catalog.filter(
    (filename) => Number(migrationVersion(filename)) > 17,
  );

  for (const migration of migrations) {
    const migrationSql = await readFile(
      new URL(`../../database/migrations/${migration}`, import.meta.url),
      "utf8",
    );
    await sql.begin(async (tx: postgres.TransactionSql) => {
      await tx.unsafe(migrationSql);
      await tx`
        INSERT INTO app.schema_migrations (version, name)
        VALUES (${migrationId(migration)}, ${migration})
      `;
    });
  }
}

function qdrantUrl() {
  return (process.env.QDRANT_URL || "http://127.0.0.1:56333").replace(
    /\/+$/,
    "",
  );
}

function qdrantHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (process.env.QDRANT_API_KEY?.trim()) {
    headers["api-key"] = process.env.QDRANT_API_KEY.trim();
  }
  return headers;
}

async function qdrantFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${qdrantUrl()}${path}`, {
    ...init,
    headers: { ...qdrantHeaders(), ...(init.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Qdrant ${init.method || "GET"} ${path} failed: ${res.status} ${body}`,
    );
  }
  if (res.status === 204) return undefined;
  return await res.json();
}

async function resetQdrant(): Promise<void> {
  await fetch(`${qdrantUrl()}/collections/${qdrantCollection}`, {
    method: "DELETE",
    headers: qdrantHeaders(),
  }).catch(() => undefined);

  await qdrantFetch(`/collections/${qdrantCollection}`, {
    method: "PUT",
    body: JSON.stringify({
      vectors: { size: 4096, distance: "Cosine" },
      hnsw_config: {
        m: 16,
        ef_construct: 100,
      },
      optimizers_config: {
        indexing_threshold: 1,
      },
    }),
  });
}

async function seedUser(sql: postgres.Sql): Promise<void> {
  const hashedPassword = await bcrypt.hash(seedPassword, 10);
  const noteId = "22222222-2222-4222-8222-222222222222";
  const chunkId = "33333333-3333-4333-8333-333333333333";
  const questionId = "55555555-5555-4555-8555-555555555555";
  const cardId = "66666666-6666-4666-8666-666666666666";
  const assignmentId = "77777777-7777-4777-8777-777777777777";
  const timeBlockId = "88888888-8888-4888-8888-888888888888";
  const chatSessionId = "99999999-9999-4999-8999-999999999999";
  const chatMessageId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const vector4096 = Array.from({ length: 4096 }, (_, index) =>
    index === 0 ? 1 : 0,
  );

  await sql`
    INSERT INTO app.login (
      user_id, email, hashed_password, email_verified, display_name, is_active
    )
    VALUES (
      ${seedUserId}::uuid,
      ${seedEmail},
      ${hashedPassword},
      true,
      'E2E Student',
      true
    )
    ON CONFLICT (email) DO UPDATE
      SET hashed_password = EXCLUDED.hashed_password,
          email_verified = true,
          deleted_at = NULL,
          is_active = true
  `;

  await sql`
    INSERT INTO app.notes (note_id, user_id, title, content, is_folder, created_at, updated_at)
    VALUES (
      ${noteId}::uuid,
      ${seedUserId}::uuid,
      'E2E Getting Started',
      '# E2E Getting Started\n\nThis note is seeded by scripts/e2e/reset-db.ts.',
      false,
      NOW(),
      NOW()
    )
    ON CONFLICT (note_id) DO UPDATE
      SET title = EXCLUDED.title,
          content = EXCLUDED.content,
          deleted_at = NULL,
          updated_at = NOW()
  `;

  await sql`
    INSERT INTO app.tree_items (id, user_id, note_id, parent_id)
    VALUES (${randomUUID()}::uuid, ${seedUserId}::uuid, ${noteId}::uuid, NULL)
    ON CONFLICT (user_id, note_id) DO NOTHING
  `;

  await sql`
    INSERT INTO app.chunks (id, document_id, user_id, text, section)
    VALUES (
      ${chunkId}::uuid,
      ${noteId}::uuid,
      ${seedUserId}::uuid,
      'Playwright seeded content about software engineering tests and study planning.',
      'E2E seed'
    )
    ON CONFLICT (id) DO UPDATE
      SET text = EXCLUDED.text
  `;

  await qdrantFetch(`/collections/${qdrantCollection}/points?wait=true`, {
    method: "PUT",
    body: JSON.stringify({
      points: [
        {
          id: chunkId,
          vector: vector4096,
          payload: {
            chunk_id: chunkId,
            document_id: noteId,
            user_id: seedUserId,
          },
        },
      ],
    }),
  });

  await sql`
    INSERT INTO app.quiz_questions (
      id, user_id, note_id, chunk_id, question_type, bloom_level,
      question_text, options, correct_answer, explanation
    )
    VALUES (
      ${questionId}::uuid,
      ${seedUserId}::uuid,
      ${noteId}::uuid,
      ${chunkId}::uuid,
      'mcq',
      1,
      'What does an E2E smoke test verify?',
      ${JSON.stringify(["A real user path", "Only a pure function", "Only CSS tokens", "Only billing"])}::jsonb,
      'A real user path',
      'Smoke tests cover the most important integrated path with minimal breadth.'
    )
    ON CONFLICT (id) DO UPDATE
      SET question_text = EXCLUDED.question_text,
          options = EXCLUDED.options,
          correct_answer = EXCLUDED.correct_answer,
          explanation = EXCLUDED.explanation
  `;

  await sql`
    INSERT INTO app.quiz_cards (
      id, user_id, question_id, state, stability, difficulty, due, created_at
    )
    VALUES (
      ${cardId}::uuid,
      ${seedUserId}::uuid,
      ${questionId}::uuid,
      'new',
      0,
      0,
      NOW() - INTERVAL '1 minute',
      NOW()
    )
    ON CONFLICT (id) DO UPDATE
      SET due = NOW() - INTERVAL '1 minute',
          state = 'new'
  `;

  await sql`
    INSERT INTO app.assignments (
      id, user_id, title, description, course_name, due_at, estimated_hours, status, source
    )
    VALUES (
      ${assignmentId}::uuid,
      ${seedUserId}::uuid,
      'E2E Study Plan',
      'Seeded assignment for calendar and planner smoke tests.',
      'CT216',
      NOW() + INTERVAL '2 days',
      1.5,
      'upcoming',
      'manual'
    )
    ON CONFLICT (id) DO UPDATE
      SET title = EXCLUDED.title,
          due_at = EXCLUDED.due_at,
          status = EXCLUDED.status
  `;

  await sql`
    INSERT INTO app.time_blocks (
      id, user_id, assignment_id, title, starts_at, ends_at, pomodoro_count
    )
    VALUES (
      ${timeBlockId}::uuid,
      ${seedUserId}::uuid,
      ${assignmentId}::uuid,
      'E2E Focus Block',
      NOW() + INTERVAL '1 day',
      NOW() + INTERVAL '1 day 1 hour',
      2
    )
    ON CONFLICT (id) DO UPDATE
      SET starts_at = EXCLUDED.starts_at,
          ends_at = EXCLUDED.ends_at
  `;

  await sql`
    INSERT INTO app.chat_sessions (id, user_id, note_id, title, context, created_at, updated_at)
    VALUES (
      ${chatSessionId}::uuid,
      ${seedUserId}::uuid,
      ${noteId}::uuid,
      'E2E Seed Chat',
      '{}'::jsonb,
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE
      SET title = EXCLUDED.title,
          updated_at = NOW()
  `;

  await sql`
    INSERT INTO app.chat_messages (id, session_id, role, content, sources, parts, created_at)
    VALUES (
      ${chatMessageId}::uuid,
      ${chatSessionId}::uuid,
      'assistant',
      'E2E seeded chat message.',
      '[]'::jsonb,
      ${JSON.stringify([{ type: "text", text: "E2E seeded chat message." }])}::jsonb,
      NOW()
    )
    ON CONFLICT (id) DO UPDATE
      SET content = EXCLUDED.content,
          parts = EXCLUDED.parts
  `;
}

async function flushRedis(): Promise<void> {
  if (process.env.E2E_RESET_REDIS === "0") return;
  const host = process.env.REDIS_HOST;
  const port = Number(process.env.REDIS_PORT || 6379);
  if (!host) return;

  const redis = new IORedis({ host, port, maxRetriesPerRequest: 1 });
  try {
    await redis.flushdb();
  } finally {
    redis.disconnect();
  }
}

async function main(): Promise<void> {
  assertSafeDatabaseUrl(databaseUrl);
  const migrationSql = await loadStandaloneMigrationSql();

  const sql = postgres(databaseUrl, {
    ssl: databaseUrl.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : false,
    max: 1,
  });

  try {
    await sql.unsafe("DROP SCHEMA IF EXISTS app CASCADE; CREATE SCHEMA app;");
    await sql.unsafe(migrationSql);
    await applyCurrentSchemaPatch(sql);
    await applyCanonicalMigrations(sql);
    await resetQdrant();
    await seedUser(sql);
    await flushRedis();
    console.log(
      `[e2e] reset complete for ${new URL(databaseUrl).pathname.slice(1)}`,
    );
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("[e2e] reset failed:", errorMessage(error));
  process.exit(1);
});
