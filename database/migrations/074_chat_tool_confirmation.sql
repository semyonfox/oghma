CREATE TABLE app.chat_tool_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
  session_id uuid REFERENCES app.chat_sessions(id) ON DELETE CASCADE,
  session_version integer NOT NULL,
  tool_name text NOT NULL,
  input jsonb NOT NULL CHECK (octet_length(input::text) <= 524288),
  target_origin text,
  target_fingerprint text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','executing','completed','failed','rejected')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX chat_tool_actions_user_expiry ON app.chat_tool_actions(user_id, expires_at);
