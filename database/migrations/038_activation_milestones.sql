-- One immutable first-value milestone per authenticated account.
-- This remains account-scoped product measurement, never browser/session tracking.
CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_events_activation_milestone_once
    ON app.marketing_events (user_id, event_name)
    WHERE user_id IS NOT NULL
      AND event_name IN (
          'email_verified',
          'canvas_import_started',
          'canvas_import_completed',
          'first_cited_answer',
          'first_flashcard_generated'
      );

COMMENT ON INDEX app.idx_marketing_events_activation_milestone_once IS
    'Makes authenticated first-value activation milestones idempotent per account.';
