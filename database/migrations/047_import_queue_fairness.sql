-- Weighted fair scheduling for Canvas per-file work.
ALTER TABLE app.login
  ADD COLUMN IF NOT EXISTS import_service_class TEXT NOT NULL DEFAULT 'free';

ALTER TABLE app.login
  DROP CONSTRAINT IF EXISTS login_import_service_class_check;
ALTER TABLE app.login
  ADD CONSTRAINT login_import_service_class_check
  CHECK (import_service_class IN ('free', 'semester', 'academic_year'));

ALTER TABLE app.canvas_imports
  ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_canvas_imports_fair_dispatch
  ON app.canvas_imports (status, dispatched_at, created_at)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS app.import_scheduler_classes (
  service_class TEXT PRIMARY KEY
    CHECK (service_class IN ('free', 'semester', 'academic_year')),
  current_weight INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app.import_scheduler_classes (service_class)
VALUES ('free'), ('semester'), ('academic_year')
ON CONFLICT (service_class) DO NOTHING;

CREATE TABLE IF NOT EXISTS app.import_scheduler_users (
  user_id UUID PRIMARY KEY,
  last_dispatched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
