-- Existing accounts stay NULL and never receive the first-login welcome.
ALTER TABLE app.login
  ADD COLUMN welcome_note_id UUID;
