-- Initial schema for local development
CREATE INDEX IF NOT EXISTS idx_login_email ON public.login(email);
-- Simple index (unique already exists on email)

);
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  hashed_password TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  user_id SERIAL PRIMARY KEY,
CREATE TABLE IF NOT EXISTS public.login (

