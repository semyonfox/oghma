-- Canvas documents all integer IDs as signed 64-bit values. Widen every
-- legacy Canvas identity column before accepting string IDs from the API.
-- ALTER TYPE bigint is idempotent when the column is already bigint and keeps
-- the existing indexes/unique constraints attached to each column.

ALTER TABLE app.notes
  ALTER COLUMN canvas_course_id TYPE bigint USING canvas_course_id::bigint,
  ALTER COLUMN canvas_module_id TYPE bigint USING canvas_module_id::bigint,
  ALTER COLUMN canvas_assignment_id TYPE bigint USING canvas_assignment_id::bigint;

ALTER TABLE app.canvas_imports
  ALTER COLUMN canvas_course_id TYPE bigint USING canvas_course_id::bigint,
  ALTER COLUMN canvas_module_id TYPE bigint USING canvas_module_id::bigint,
  ALTER COLUMN canvas_file_id TYPE bigint USING canvas_file_id::bigint;

ALTER TABLE app.user_course_settings
  ALTER COLUMN canvas_course_id TYPE bigint USING canvas_course_id::bigint;

ALTER TABLE app.assignments
  ALTER COLUMN canvas_course_id TYPE bigint USING canvas_course_id::bigint,
  ALTER COLUMN canvas_assignment_id TYPE bigint USING canvas_assignment_id::bigint;
