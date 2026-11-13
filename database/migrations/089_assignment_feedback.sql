SET LOCAL lock_timeout = '3s';

ALTER TABLE app.assignments ADD COLUMN IF NOT EXISTS graded_at TIMESTAMPTZ;
ALTER TABLE app.assignments ADD COLUMN IF NOT EXISTS grade TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_assignments_owner_id ON app.assignments (user_id, id);
CREATE INDEX IF NOT EXISTS idx_assignments_recent_graded
    ON app.assignments (user_id, graded_at DESC, id) WHERE graded_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS app.assignment_feedback (
    assignment_id UUID PRIMARY KEY REFERENCES app.assignments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    comments JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(comments) = 'array'),
    rubric JSONB CHECK (jsonb_typeof(rubric) = 'array'),
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT assignment_feedback_owned_assignment_fk
        FOREIGN KEY (user_id, assignment_id) REFERENCES app.assignments(user_id, id) ON DELETE CASCADE
);
