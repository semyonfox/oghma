-- add email verification columns to app.login
-- run this migration before deploying the email verification feature

ALTER TABLE app.login
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification_token TEXT,
  ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMPTZ;

-- mark all existing users as verified (they've been using the app already)
UPDATE app.login SET email_verified = true WHERE email_verified = false;
