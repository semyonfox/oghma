#!/usr/bin/env node

import bcrypt from "bcryptjs";
import IORedis from "ioredis";
import postgres from "postgres";
import { randomUUID } from "crypto";
import { readFile } from "fs/promises";
import { MIGRATION_SQL } from "../standalone-migration.mjs";
import { loadE2EEnvFiles } from "./lib/env.mjs";

loadE2EEnvFiles();

const databaseUrl = process.env.DATABASE_URL || process.env.E2E_DATABASE_URL;
const seedEmail = process.env.E2E_SEED_USER_EMAIL || "student.e2e@example.com";
const seedPassword = process.env.E2E_SEED_USER_PASSWORD || "E2ePassword123!";
const seedUserId =
  process.env.E2E_SEED_USER_ID || "11111111-1111-4111-8111-111111111111";
const qdrantCollection = process.env.QDRANT_COLLECTION || "oghma_e2e_chunks";

function assertSafeDatabaseUrl(dbUrl) {
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

async function applyCurrentSchemaPatch(sql) {
  await sql.unsafe(`
    ALTER TABLE app.login
      ADD COLUMN IF NOT EXISTS canvas_token TEXT,
      ADD COLUMN IF NOT EXISTS canvas_domain TEXT,
      ADD COLUMN IF NOT EXISTS calendar_export_token UUID;

    DELETE FROM app.chunks;
    DROP TABLE IF EXISTS app.embeddings;

    CREATE TABLE IF NOT EXISTS app.quiz_sessions (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         UUID NOT NULL,
      filter_type     TEXT NOT NULL,
      filter_value    JSONB,
      total_questions INTEGER NOT NULL DEFAULT 0,
      correct_count   INTEGER NOT NULL DEFAULT 0,
      card_ids        JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(card_ids) = 'array'),
      started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at    TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS app.quiz_reviews (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id          UUID NOT NULL,
      card_id          UUID NOT NULL,
      question_id      UUID NOT NULL,
      session_id       UUID,
      rating           INTEGER NOT NULL,
      user_answer      TEXT NOT NULL DEFAULT '',
      was_correct      BOOLEAN NOT NULL,
      response_time_ms INTEGER,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS app.user_streaks (
      user_id           UUID PRIMARY KEY,
      current_streak    INTEGER NOT NULL DEFAULT 0,
      longest_streak    INTEGER NOT NULL DEFAULT 0,
      last_review_date  DATE,
      total_review_days INTEGER NOT NULL DEFAULT 0,
      streak_milestones JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS app.user_course_settings (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id          UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
      canvas_course_id INTEGER NOT NULL,
      course_name      TEXT NOT NULL,
      is_active        BOOLEAN NOT NULL DEFAULT true,
      auto_archived    BOOLEAN NOT NULL DEFAULT false,
      archived_at      TIMESTAMPTZ,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, canvas_course_id)
    );

    CREATE TABLE IF NOT EXISTS app.assignments (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id              UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
      canvas_course_id     INTEGER,
      canvas_assignment_id INTEGER,
      title                TEXT NOT NULL,
      description          TEXT,
      course_name          TEXT,
      course_color         TEXT,
      due_at               TIMESTAMPTZ,
      estimated_hours      DOUBLE PRECISION,
      logged_hours         DOUBLE PRECISION NOT NULL DEFAULT 0,
      status               TEXT NOT NULL DEFAULT 'upcoming',
      source               TEXT NOT NULL DEFAULT 'manual',
      submitted_at         TIMESTAMPTZ,
      score                DOUBLE PRECISION,
      points_possible      DOUBLE PRECISION,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS app.time_blocks (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
      assignment_id  UUID REFERENCES app.assignments(id) ON DELETE SET NULL,
      title          TEXT,
      starts_at      TIMESTAMPTZ NOT NULL,
      ends_at        TIMESTAMPTZ NOT NULL,
      pomodoro_count INTEGER NOT NULL DEFAULT 1,
      completed      BOOLEAN NOT NULL DEFAULT false,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS app.pomodoro_sessions (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
      assignment_id UUID REFERENCES app.assignments(id) ON DELETE SET NULL,
      time_block_id UUID REFERENCES app.time_blocks(id) ON DELETE SET NULL,
      started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at      TIMESTAMPTZ,
      duration_mins INTEGER NOT NULL DEFAULT 25,
      type          TEXT NOT NULL DEFAULT 'focus',
      completed     BOOLEAN NOT NULL DEFAULT false,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS app.ingestion_jobs (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      note_id       UUID NOT NULL REFERENCES app.notes(note_id) ON DELETE CASCADE,
      user_id       UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
      s3_key        TEXT NOT NULL,
      mime_type     TEXT,
      status        TEXT NOT NULL DEFAULT 'pending',
      chunks_stored INTEGER NOT NULL DEFAULT 0,
      error         TEXT,
      error_message TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(note_id, s3_key)
    );

    CREATE TABLE IF NOT EXISTS app.marketing_events (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_name     TEXT NOT NULL,
      user_id        UUID REFERENCES app.login(user_id) ON DELETE SET NULL,
      path           TEXT,
      referrer       TEXT,
      source         TEXT,
      target_url     TEXT,
      utm_source     TEXT,
      utm_medium     TEXT,
      utm_campaign   TEXT,
      utm_content    TEXT,
      utm_term       TEXT,
      properties     JSONB NOT NULL DEFAULT '{}'::jsonb,
      occurred_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      from_path      TEXT,
      to_path        TEXT,
      origin_class   TEXT,
      placement      TEXT,
      action         TEXT,
      CONSTRAINT marketing_events_event_name_length
        CHECK (char_length(event_name) BETWEEN 1 AND 96),
      CONSTRAINT marketing_events_navigation_origin_class
        CHECK (origin_class IS NULL OR origin_class IN ('direct', 'external', 'internal'))
    );

    CREATE TABLE IF NOT EXISTS app.rate_limit_log (
      id         BIGSERIAL PRIMARY KEY,
      category   TEXT NOT NULL,
      identifier TEXT NOT NULL,
      blocked    BOOLEAN NOT NULL DEFAULT false,
      count      INTEGER NOT NULL DEFAULT 0,
      limit_max  INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE app.chat_sessions
      ADD COLUMN IF NOT EXISTS context JSONB NOT NULL DEFAULT '{}'::jsonb;

    ALTER TABLE app.chat_messages
      ADD COLUMN IF NOT EXISTS parts JSONB;
    UPDATE app.chat_messages
      SET parts = jsonb_build_array(jsonb_build_object('type', 'text', 'text', content))
      WHERE parts IS NULL;
    ALTER TABLE app.chat_messages
      ALTER COLUMN parts SET DEFAULT '[]'::jsonb,
      ALTER COLUMN parts SET NOT NULL;

    ALTER TABLE app.canvas_imports
      ADD COLUMN IF NOT EXISTS parent_folder_id UUID,
      ADD COLUMN IF NOT EXISTS s3_prefix TEXT;

    ALTER TABLE app.canvas_import_jobs
      ALTER COLUMN status TYPE TEXT,
      ADD COLUMN IF NOT EXISTS processed_files INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ;

    CREATE UNIQUE INDEX IF NOT EXISTS canvas_imports_user_file_unique
      ON app.canvas_imports (user_id, canvas_file_id);
    CREATE INDEX IF NOT EXISTS idx_canvas_imports_job
      ON app.canvas_imports(job_id);
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_user
      ON app.chat_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_session
      ON app.chat_messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_quiz_sessions_user
      ON app.quiz_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_quiz_cards_user_state
      ON app.quiz_cards(user_id, state);
    CREATE INDEX IF NOT EXISTS idx_time_blocks_user_range
      ON app.time_blocks(user_id, starts_at, ends_at);
    CREATE INDEX IF NOT EXISTS idx_marketing_events_event_time
      ON app.marketing_events(event_name, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_marketing_events_user_time
      ON app.marketing_events(user_id, occurred_at DESC)
      WHERE user_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_marketing_events_utm_campaign_time
      ON app.marketing_events(utm_campaign, occurred_at DESC)
      WHERE utm_campaign IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_marketing_events_navigation_aggregate
      ON app.marketing_events(to_path, from_path, origin_class, placement, action, occurred_at DESC)
      WHERE event_name = 'navigation_transition';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_events_activation_milestone_once
      ON app.marketing_events(user_id, event_name)
      WHERE user_id IS NOT NULL
        AND event_name IN (
          'email_verified',
          'canvas_import_started',
          'canvas_import_completed',
          'first_cited_answer',
          'first_flashcard_generated'
        );
  `);
}

function qdrantUrl() {
  return (process.env.QDRANT_URL || "http://127.0.0.1:56333").replace(
    /\/+$/,
    "",
  );
}

function qdrantHeaders() {
  const headers = { "content-type": "application/json" };
  if (process.env.QDRANT_API_KEY?.trim()) {
    headers["api-key"] = process.env.QDRANT_API_KEY.trim();
  }
  return headers;
}

async function qdrantFetch(path, init = {}) {
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

async function resetQdrant() {
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

async function seedUser(sql) {
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
      '# E2E Getting Started\n\nThis note is seeded by scripts/e2e/reset-db.mjs.',
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

async function flushRedis() {
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

async function main() {
  assertSafeDatabaseUrl(databaseUrl);

  const sql = postgres(databaseUrl, {
    ssl: databaseUrl.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : false,
    max: 1,
  });

  try {
    await sql.unsafe("DROP SCHEMA IF EXISTS app CASCADE; CREATE SCHEMA app;");
    await sql.unsafe(MIGRATION_SQL);
    await applyCurrentSchemaPatch(sql);
    for (const migration of [
      "041_chat_generation_status.sql",
      "042_resumable_chat_generations.sql",
      "043_chat_session_pinning.sql",
      "045_imported_file_cache.sql",
      "049_note_links.sql",
    ]) {
      await sql.unsafe(
        await readFile(
          new URL(`../../database/migrations/${migration}`, import.meta.url),
          "utf8",
        ),
      );
    }
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
  console.error("[e2e] reset failed:", error.message);
  process.exit(1);
});
