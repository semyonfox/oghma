-- Add tree structure and vector support for notes
-- This migration adds:
-- 1. Tree hierarchy (per-user file structure)
-- 2. Vector embeddings for semantic search
-- 3. Extracted text from documents
-- 4. Attachments tracking
-- 5. PDF annotations

-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

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

-- Add columns to existing notes table
ALTER TABLE app.notes ADD COLUMN IF NOT EXISTS s3_key TEXT;
ALTER TABLE app.notes ADD COLUMN IF NOT EXISTS extracted_text TEXT;
ALTER TABLE app.notes ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tree_items_user_id ON app.tree_items(user_id);
CREATE INDEX IF NOT EXISTS idx_tree_items_note_id ON app.tree_items(note_id);
CREATE INDEX IF NOT EXISTS idx_tree_items_parent_id ON app.tree_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_attachments_note_id ON app.attachments(note_id);
CREATE INDEX IF NOT EXISTS idx_pdf_annotations_note_id ON app.pdf_annotations(note_id);
CREATE INDEX IF NOT EXISTS idx_pdf_annotations_user_id ON app.pdf_annotations(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_s3_key ON app.notes(s3_key);
CREATE INDEX IF NOT EXISTS idx_notes_embedding ON app.notes USING ivfflat (embedding vector_cosine_ops);
