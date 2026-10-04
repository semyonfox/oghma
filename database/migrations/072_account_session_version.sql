-- revoke tokens issued before the session version contract
ALTER TABLE app.login ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 0;
ALTER TABLE app.login ADD CONSTRAINT login_session_version_nonnegative CHECK (session_version >= 0);
UPDATE app.login SET calendar_export_token = NULL WHERE is_active = false OR deleted_at IS NOT NULL;
