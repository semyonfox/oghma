-- Add is_active column to app.login table
-- Defaults to true for existing users, allowing account deactivation on deletion
ALTER TABLE app.login
ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;

-- Create index for active user lookups
CREATE INDEX idx_login_active ON app.login(is_active)
  WHERE is_active = true;
