SET LOCAL lock_timeout = '3s';

-- set when canvas rejects the stored token (a 401), cleared when a working
-- token is saved or canvas accepts it again. lets the app show a "reconnect"
-- banner without calling canvas on every page load
ALTER TABLE app.login ADD COLUMN IF NOT EXISTS canvas_token_invalid_at TIMESTAMPTZ;
