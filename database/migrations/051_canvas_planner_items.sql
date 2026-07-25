CREATE TABLE IF NOT EXISTS app.canvas_planner_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
  canvas_domain text NOT NULL,
  canvas_user_id bigint,
  canvas_course_id bigint,
  canvas_context_type text,
  canvas_context_id bigint,
  context_name text,
  plannable_type text NOT NULL,
  plannable_id text NOT NULL,
  canvas_planner_item_id text,
  title text NOT NULL,
  body text,
  html_url text,
  source text NOT NULL DEFAULT 'canvas',
  item_state text NOT NULL DEFAULT 'active',
  display_at timestamptz,
  due_at timestamptz,
  available_at timestamptz,
  end_at timestamptz,
  date_source text NOT NULL,
  all_day boolean NOT NULL DEFAULT false,
  raw_planner_item jsonb,
  raw_plannable jsonb,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, canvas_domain, plannable_type, plannable_id),
  CONSTRAINT canvas_planner_items_plannable_type_check
    CHECK (plannable_type IN ('assignment', 'quiz', 'discussion_topic', 'announcement', 'calendar_event', 'planner_note', 'other')),
  CONSTRAINT canvas_planner_items_item_state_check
    CHECK (item_state IN ('active', 'deleted', 'hidden', 'cancelled')),
  CONSTRAINT canvas_planner_items_date_source_check
    CHECK (date_source IN ('due_at', 'todo_date', 'plannable_date', 'posted_at', 'delayed_post_at', 'start_at', 'none'))
);

CREATE INDEX IF NOT EXISTS idx_canvas_planner_items_user_display_at
  ON app.canvas_planner_items(user_id, display_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_canvas_planner_items_user_course
  ON app.canvas_planner_items(user_id, canvas_course_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_canvas_planner_items_user_type_identity
  ON app.canvas_planner_items(user_id, plannable_type, plannable_id)
  WHERE deleted_at IS NULL;
