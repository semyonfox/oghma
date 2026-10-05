SET LOCAL lock_timeout = '3s';

-- study maps are created automatically for imported Canvas courses
-- deleting one records the course here so opening the page does not recreate it
CREATE TABLE IF NOT EXISTS app.study_map_dismissed_courses (
    user_id          UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    canvas_course_id TEXT NOT NULL CHECK (canvas_course_id ~ '^[0-9]{1,30}$'),
    dismissed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, canvas_course_id)
);
