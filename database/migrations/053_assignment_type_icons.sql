ALTER TABLE app.assignments
  ADD COLUMN IF NOT EXISTS assignment_type TEXT NOT NULL DEFAULT 'unknown';

UPDATE app.assignments
SET assignment_type = 'manual'
WHERE source = 'manual'
  AND assignment_type <> 'manual';

UPDATE app.assignments
SET assignment_type = 'unknown'
WHERE source = 'canvas'
  AND assignment_type NOT IN ('quiz', 'assignment', 'unknown');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'assignments_assignment_type_check'
      AND conrelid = 'app.assignments'::regclass
  ) THEN
    ALTER TABLE app.assignments
      ADD CONSTRAINT assignments_assignment_type_check
      CHECK (assignment_type IN ('quiz', 'assignment', 'manual', 'unknown'));
  END IF;
END $$;
