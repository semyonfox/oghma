CREATE TABLE IF NOT EXISTS app.marker_jobs (
    callback_id UUID PRIMARY KEY,
    runpod_job_id TEXT UNIQUE,
    note_id UUID NOT NULL REFERENCES app.notes(note_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    canvas_job_id UUID REFERENCES app.canvas_import_jobs(id) ON DELETE SET NULL,
    parent_folder_id UUID REFERENCES app.notes(note_id) ON DELETE SET NULL,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    source_key TEXT NOT NULL,
    result_key TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_marker_jobs_note
    ON app.marker_jobs(note_id, created_at DESC);

COMMENT ON TABLE app.marker_jobs IS
    'Idempotency and callback metadata for asynchronous RunPod Marker jobs.';
