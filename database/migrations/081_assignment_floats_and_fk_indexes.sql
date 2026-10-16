SET LOCAL lock_timeout = '3s';

-- databases that created app.assignments before 019 kept these columns as NUMERIC,
-- which postgres.js returns as strings, so readers got "1.5" where the schema
-- promises 1.5. convert only the drifted columns; matching ones are untouched
DO $$
DECLARE
    drifted record;
BEGIN
    FOR drifted IN
        SELECT column_name::text AS column_name
        FROM information_schema.columns
        WHERE table_schema = 'app'
          AND table_name = 'assignments'
          AND data_type = 'numeric'
          AND column_name::text IN ('estimated_hours', 'logged_hours', 'score', 'points_possible')
    LOOP
        EXECUTE format(
            'ALTER TABLE app.assignments ALTER COLUMN %I TYPE double precision USING %I::double precision',
            drifted.column_name, drifted.column_name
        );
    END LOOP;
END $$;

-- ON DELETE actions look up referencing rows once per deleted parent row. without
-- an index, purging a folder of notes or clearing a vault scans these tables for
-- every row it deletes. all of them are small, so a plain build inside the
-- runner's transaction is brief
CREATE INDEX IF NOT EXISTS idx_marker_jobs_parent_folder
    ON app.marker_jobs (parent_folder_id) WHERE parent_folder_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marker_jobs_canvas_job
    ON app.marker_jobs (canvas_job_id) WHERE canvas_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marker_jobs_user
    ON app.marker_jobs (user_id);

CREATE INDEX IF NOT EXISTS idx_imported_file_cache_owner_import
    ON app.imported_file_cache (owner_import_id) WHERE owner_import_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_imported_file_cache_owner_job
    ON app.imported_file_cache (owner_job_id) WHERE owner_job_id IS NOT NULL;
-- the existing available_cache_id index only covers status = 'available'
CREATE INDEX IF NOT EXISTS idx_imported_file_cache_note_updates_base
    ON app.imported_file_cache_note_updates (base_cache_id);
CREATE INDEX IF NOT EXISTS idx_imported_file_cache_note_updates_available_any
    ON app.imported_file_cache_note_updates (available_cache_id);

CREATE INDEX IF NOT EXISTS idx_canvas_import_jobs_source_job
    ON app.canvas_import_jobs (source_job_id) WHERE source_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vault_artifacts_job
    ON app.vault_artifacts (job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_tool_actions_session
    ON app.chat_tool_actions (session_id) WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_time_blocks_assignment
    ON app.time_blocks (assignment_id) WHERE assignment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pomodoro_sessions_assignment
    ON app.pomodoro_sessions (assignment_id) WHERE assignment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pomodoro_sessions_time_block
    ON app.pomodoro_sessions (time_block_id) WHERE time_block_id IS NOT NULL;
