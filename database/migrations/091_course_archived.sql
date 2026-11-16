-- one rule for whether a canvas course is archived, so every feature agrees.
-- the user's own choice in user_course_settings wins, otherwise canvas saying the
-- course is past or gone. no row and no status, or a null course, means active.
-- keep in step with canvasSaysFinished in src/lib/notes/tree-topics.ts
CREATE OR REPLACE FUNCTION app.course_archived(p_user_id UUID, p_course_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql STABLE PARALLEL SAFE
AS $$
  SELECT COALESCE(
    (SELECT NOT s.is_active FROM app.user_course_settings s
     WHERE s.user_id = p_user_id AND s.canvas_course_id = p_course_id),
    (SELECT c.status IN ('past', 'inaccessible') FROM app.canvas_course_status c
     WHERE c.user_id = p_user_id AND c.canvas_course_id = p_course_id),
    false
  )
$$;
