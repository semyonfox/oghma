-- Add deleted_at column to app.login table for soft-delete functionality
-- Allows tracking when accounts are marked for deletion
ALTER TABLE app.login
ADD COLUMN deleted_at TIMESTAMPTZ;

-- Create index for checking active accounts
CREATE INDEX idx_login_deleted_at ON app.login(deleted_at)
  WHERE deleted_at IS NULL;
