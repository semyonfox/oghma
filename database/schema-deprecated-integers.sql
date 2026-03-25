-- Initial schema for production deployment
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS app.login (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  hashed_password TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.notes (
  note_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  s3_key TEXT,
  extracted_text TEXT,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tree structure for file hierarchy (per-user)
CREATE TABLE IF NOT EXISTS app.tree_items (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
  note_id INTEGER REFERENCES app.notes(note_id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES app.tree_items(id) ON DELETE CASCADE,
  is_expanded BOOLEAN DEFAULT FALSE,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Attachments for notes (PDFs, images, etc)
CREATE TABLE IF NOT EXISTS app.attachments (
  id SERIAL PRIMARY KEY,
  note_id INTEGER NOT NULL REFERENCES app.notes(note_id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  s3_key TEXT NOT NULL,
  mime_type TEXT,
  size INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Annotations for PDFs
CREATE TABLE IF NOT EXISTS app.pdf_annotations (
  id SERIAL PRIMARY KEY,
  note_id INTEGER NOT NULL REFERENCES app.notes(note_id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
  attachment_id INTEGER REFERENCES app.attachments(id) ON DELETE CASCADE,
  annotation_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_login_email ON app.login(email);
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON app.notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON app.notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tree_items_user_id ON app.tree_items(user_id);
CREATE INDEX IF NOT EXISTS idx_tree_items_note_id ON app.tree_items(note_id);
CREATE INDEX IF NOT EXISTS idx_tree_items_parent_id ON app.tree_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_attachments_note_id ON app.attachments(note_id);
CREATE INDEX IF NOT EXISTS idx_pdf_annotations_note_id ON app.pdf_annotations(note_id);
CREATE INDEX IF NOT EXISTS idx_pdf_annotations_user_id ON app.pdf_annotations(user_id);

