-- 019_soft_delete_cleanup_and_missing_tables.sql
-- 1. standardise soft delete on notes: drop legacy deleted INTEGER, use deleted_at alone
-- 2. fix VARCHAR → TEXT on canvas_import_jobs.status
-- 3. create assignments, time_blocks, pomodoro_sessions (pre-migration tables with no DDL)

-- safety: backfill deleted_at for any rows where deleted=1 but deleted_at is null
UPDATE app.notes
SET deleted_at = NOW()
WHERE deleted = 1 AND deleted_at IS NULL;

-- drop the redundant integer column
ALTER TABLE app.notes DROP COLUMN IF EXISTS deleted;

-- fix type inconsistency: VARCHAR → TEXT (no perf difference in pg, just consistency)
ALTER TABLE app.canvas_import_jobs ALTER COLUMN status TYPE TEXT;

-- assignments table: tracks Canvas-synced and manual tasks
CREATE TABLE IF NOT EXISTS app.assignments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    canvas_course_id    INTEGER,
    canvas_assignment_id INTEGER,
    title           TEXT NOT NULL,
    description     TEXT,
    course_name     TEXT,
    course_color    TEXT,
    due_at          TIMESTAMPTZ,
    estimated_hours DOUBLE PRECISION,
    logged_hours    DOUBLE PRECISION NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'upcoming',
    source          TEXT NOT NULL DEFAULT 'manual',
    submitted_at    TIMESTAMPTZ,
    score           DOUBLE PRECISION,
    points_possible DOUBLE PRECISION,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- partial unique index for Canvas upsert (only when canvas_assignment_id is set)
CREATE UNIQUE INDEX IF NOT EXISTS uq_assignments_user_canvas
    ON app.assignments(user_id, canvas_assignment_id)
    WHERE canvas_assignment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assignments_user
    ON app.assignments(user_id);

CREATE INDEX IF NOT EXISTS idx_assignments_user_due
    ON app.assignments(user_id, due_at);

-- time blocks: calendar schedule blocks linked to assignments
CREATE TABLE IF NOT EXISTS app.time_blocks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    assignment_id   UUID REFERENCES app.assignments(id) ON DELETE SET NULL,
    title           TEXT,
    starts_at       TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ NOT NULL,
    pomodoro_count  INTEGER NOT NULL DEFAULT 1,
    completed       BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_blocks_user
    ON app.time_blocks(user_id);

CREATE INDEX IF NOT EXISTS idx_time_blocks_user_range
    ON app.time_blocks(user_id, starts_at, ends_at);

-- pomodoro sessions: individual focus/break timers linked to blocks and assignments
CREATE TABLE IF NOT EXISTS app.pomodoro_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    assignment_id   UUID REFERENCES app.assignments(id) ON DELETE SET NULL,
    time_block_id   UUID REFERENCES app.time_blocks(id) ON DELETE SET NULL,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at        TIMESTAMPTZ,
    duration_mins   INTEGER NOT NULL DEFAULT 25,
    type            TEXT NOT NULL DEFAULT 'focus',
    completed       BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pomodoro_sessions_user
    ON app.pomodoro_sessions(user_id);
