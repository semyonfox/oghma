-- adds unique constraint required by import-worker.js ON CONFLICT clause
CREATE UNIQUE INDEX IF NOT EXISTS canvas_imports_user_file_unique
ON app.canvas_imports (user_id, canvas_file_id);
