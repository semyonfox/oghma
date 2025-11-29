-- Initial schema for local development
CREATE TABLE IF NOT EXISTS public.login (
  user_id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  hashed_password TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Simple index (unique already exists on email)
CREATE INDEX IF NOT EXISTS idx_login_email ON public.login(email);

