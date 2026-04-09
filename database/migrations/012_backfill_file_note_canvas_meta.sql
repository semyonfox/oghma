-- Migration 012: backfill canvas metadata on imported file notes
--
-- Context: canvas_course_id / canvas_module_id / canvas_assignment_id were previously
-- only stored on *folder* notes (course, module, assignment). Individual file notes and
-- their sibling .md extraction notes had these columns as NULL even though they belong
-- to a specific Canvas course/module/assignment.
--
-- This migration copies canvas metadata from the immediate parent folder to all
-- non-folder notes that currently have canvas_course_id IS NULL but whose parent
-- folder does have it.  Safe to re-run (COALESCE preserves existing non-null values).

UPDATE app.notes child
SET
    canvas_course_id     = COALESCE(child.canvas_course_id,     parent.canvas_course_id),
    canvas_module_id     = COALESCE(child.canvas_module_id,     parent.canvas_module_id),
    canvas_assignment_id = COALESCE(child.canvas_assignment_id, parent.canvas_assignment_id),
    canvas_academic_year = COALESCE(child.canvas_academic_year, parent.canvas_academic_year),
    updated_at           = NOW()
FROM app.tree_items child_tree
JOIN app.notes parent ON parent.note_id = child_tree.parent_id
WHERE child_tree.note_id = child.note_id
  AND child.is_folder    = false
  AND child.deleted      = 0
  AND child.canvas_course_id IS NULL
  AND parent.canvas_course_id IS NOT NULL
  AND parent.deleted     = 0;
