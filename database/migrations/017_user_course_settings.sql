-- User course settings for active/inactive status
CREATE TABLE IF NOT EXISTS app.user_course_settings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    canvas_course_id INTEGER NOT NULL,
    course_name     TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    auto_archived   BOOLEAN NOT NULL DEFAULT false,
    archived_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, canvas_course_id)
);

CREATE INDEX IF NOT EXISTS idx_user_course_settings_user 
    ON app.user_course_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_course_settings_course 
    ON app.user_course_settings(canvas_course_id);
