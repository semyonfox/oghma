SET LOCAL lock_timeout = '3s';

-- canvas says whether each course is current or past when it lists courses.
-- this is kept per course rather than on the folder because the list is read
-- before an import creates the course folder. the tree joins the two on
-- canvas_course_id. unavailable lookups are never stored, so a failed request
-- can't overwrite a known status
CREATE TABLE IF NOT EXISTS app.canvas_course_status (
    user_id          UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    canvas_course_id BIGINT NOT NULL,
    status           TEXT NOT NULL CHECK (status IN ('current', 'past', 'pending', 'inaccessible')),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, canvas_course_id)
);

-- the user's own call on a top-level folder: true is "Mark as finished", false
-- is "Keep as active" for a course canvas calls finished. null follows canvas
ALTER TABLE app.notes ADD COLUMN IF NOT EXISTS course_finished_override BOOLEAN;

-- existing course folders have no stored status. the academic year in the
-- course code is the only signal we have, so a course from an earlier year is
-- past. the next course list from canvas replaces this with its own answer and
-- anything without a year stays unknown, which the tree treats as active
INSERT INTO app.canvas_course_status (user_id, canvas_course_id, status)
SELECT DISTINCT n.user_id, n.canvas_course_id, 'past'
FROM app.notes n
WHERE n.is_folder
  AND n.deleted_at IS NULL
  AND n.canvas_course_id IS NOT NULL
  AND n.canvas_module_id IS NULL
  AND n.canvas_assignment_id IS NULL
  AND n.canvas_academic_year ~ '^[0-9]{4}$'
  -- academic years start in september, so in october 2026 this is '2627'
  AND n.canvas_academic_year <
      to_char(NOW() - INTERVAL '8 months', 'YY') || to_char(NOW() + INTERVAL '4 months', 'YY')
ON CONFLICT (user_id, canvas_course_id) DO NOTHING;
