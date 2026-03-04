-- Initial schema for production deployment
CREATE TABLE IF NOT EXISTS app.login (
  user_id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  hashed_password TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.notes (
  note_id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_login_email ON app.login(email);
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON app.notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON app.notes(created_at DESC);

