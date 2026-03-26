-- assignment tracking, time blocks, and pomodoro sessions
-- supports both Canvas-synced and manually created assignments

CREATE TABLE app.assignments (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    -- canvas link (null for manual tasks)
    canvas_course_id     INT,
    canvas_assignment_id INT,
    -- core fields
    title                TEXT NOT NULL,
    description          TEXT,
    course_name          TEXT,
    course_color         TEXT,
    due_at               TIMESTAMPTZ,
    -- tracking
    status               TEXT NOT NULL DEFAULT 'upcoming'
                         CHECK (status IN ('upcoming', 'in_progress', 'done', 'late')),
    estimated_hours      NUMERIC(5,2),
    logged_hours         NUMERIC(5,2) NOT NULL DEFAULT 0,
    -- canvas submission data
    submitted_at         TIMESTAMPTZ,
    score                NUMERIC(6,2),
    points_possible      NUMERIC(6,2),
    -- metadata
    source               TEXT NOT NULL DEFAULT 'manual'
                         CHECK (source IN ('canvas', 'manual')),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_assignments_user_status ON app.assignments(user_id, status, due_at);
CREATE INDEX idx_assignments_user_due ON app.assignments(user_id, due_at)
    WHERE status != 'done';
CREATE UNIQUE INDEX idx_assignments_canvas_dedup
    ON app.assignments(user_id, canvas_assignment_id)
    WHERE canvas_assignment_id IS NOT NULL;

CREATE TABLE app.time_blocks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    assignment_id   UUID REFERENCES app.assignments(id) ON DELETE SET NULL,
    title           TEXT,
    starts_at       TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ NOT NULL,
    pomodoro_count  INT NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_time_blocks_user_range
    ON app.time_blocks(user_id, starts_at, ends_at);

CREATE TABLE app.pomodoro_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    assignment_id   UUID REFERENCES app.assignments(id) ON DELETE SET NULL,
    time_block_id   UUID REFERENCES app.time_blocks(id) ON DELETE SET NULL,
    started_at      TIMESTAMPTZ NOT NULL,
    ended_at        TIMESTAMPTZ,
    duration_mins   INT NOT NULL DEFAULT 25,
    type            TEXT NOT NULL DEFAULT 'focus'
                    CHECK (type IN ('focus', 'short_break', 'long_break')),
    completed       BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pomodoro_user_assignment
    ON app.pomodoro_sessions(user_id, assignment_id, started_at DESC);

-- auto-update updated_at on assignments and time_blocks
CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_assignments_updated_at
    BEFORE UPDATE ON app.assignments
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_time_blocks_updated_at
    BEFORE UPDATE ON app.time_blocks
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
