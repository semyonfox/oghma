-- Migration: Create notes table for AI learning platform
-- Phase 1 implementation for socsboard
-- Based on Notea architecture (MIT License)

-- Create notes table with S3 storage references
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL DEFAULT 'Untitled',
  s3_path VARCHAR(512) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP DEFAULT NULL,
  tags TEXT[] DEFAULT '{}',
  shared SMALLINT DEFAULT 0,
  parent_id UUID REFERENCES notes(id) ON DELETE SET NULL,
  CONSTRAINT valid_shared CHECK (shared IN (0, 1))
);

-- Create indexes for performance
CREATE INDEX idx_user_notes ON notes(user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_title_search ON notes(title) WHERE deleted_at IS NULL;
CREATE INDEX idx_shared ON notes(shared) WHERE shared = 1;
CREATE INDEX idx_parent_notes ON notes(parent_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_deleted ON notes(deleted_at);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_notes_updated_at
BEFORE UPDATE ON notes
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE notes IS 'Stores note metadata with S3 references for AI learning platform';
COMMENT ON COLUMN notes.s3_path IS 'S3 path: users/{userId}/notes/{noteId}.md';
COMMENT ON COLUMN notes.shared IS '0=PRIVATE, 1=PUBLIC (Phase 2+ feature)';
COMMENT ON COLUMN notes.parent_id IS 'For hierarchical note organization';
COMMENT ON COLUMN notes.deleted_at IS 'Soft delete timestamp';
