-- One durable Marker row owns one output object. These guards turn duplicate
-- queue delivery into a no-op before a paid GPU request can be issued.
CREATE UNIQUE INDEX IF NOT EXISTS marker_jobs_result_key_unique
    ON app.marker_jobs(result_key);

CREATE UNIQUE INDEX IF NOT EXISTS marker_jobs_one_active_note
    ON app.marker_jobs(note_id)
    WHERE status NOT IN ('completed', 'failed', 'invalid_result', 'cancelled');

-- Recovery searches dispatch states without a provider predicate, so keep the
-- hot backlog scan narrow even when historical terminal rows grow.
CREATE INDEX IF NOT EXISTS idx_marker_jobs_dispatch_recovery
    ON app.marker_jobs(status, updated_at)
    WHERE status IN (
      'dispatch_queued', 'dispatch_paused', 'enqueue_failed', 'dispatching',
      'dispatch_retry', 'recovering', 'awaiting_result'
    );
