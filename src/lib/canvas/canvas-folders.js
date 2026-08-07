/**
 * Canvas folder deduplication and naming utilities.
 * Handles find-or-create semantics backed by partial unique indexes.
 */

import sql from '../../database/pgsql.js';
import { v4 as uuidv4 } from 'uuid';
import { addNoteToTree } from '../notes/storage/pg-tree.js';
export { cleanCourseName, stripHtmlToText } from './content-formatting.js';

// sentinel ID for special Canvas structures
export const ASSIGNMENTS_PARENT_MODULE_ID = -1;

// ── Folder deduplication ────────────────────────────────────────────────────

// single query handles all three folder types via conditional column matching
function findCanvasFolder(userId, canvas) {
  const { canvasCourseId, canvasModuleId, canvasAssignmentId } = canvas;
  const hasAssignment = canvasAssignmentId != null;
  const hasModule = canvasModuleId != null;
  return sql`
    SELECT note_id FROM app.notes
    WHERE user_id = ${userId}::uuid
      AND canvas_course_id = ${canvasCourseId}::bigint
      AND CASE
        WHEN ${hasAssignment} THEN canvas_assignment_id = ${canvasAssignmentId ?? 0}::bigint
        WHEN ${hasModule}     THEN canvas_module_id = ${canvasModuleId ?? 0}::bigint
        ELSE canvas_module_id IS NULL AND canvas_assignment_id IS NULL
      END
      AND is_folder = true AND deleted_at IS NULL
    LIMIT 1
  `;
}

async function reuseExisting(noteId, userId, parentId) {
  await addNoteToTree(userId, noteId, parentId ?? null);
  return noteId;
}

export async function findOrCreateFolder(userId, title, parentId, canvas = {}) {
  const { canvasCourseId, canvasAcademicYear } = canvas;

  // try to find existing folder by canvas IDs
  if (canvasCourseId != null) {
    const existing = await findCanvasFolder(userId, canvas);
    if (existing.length > 0) return reuseExisting(existing[0].note_id, userId, parentId);
  }

  const noteId = uuidv4();
  try {
    await sql`
      INSERT INTO app.notes (
        note_id, user_id, title, content, is_folder,
        canvas_course_id, canvas_module_id, canvas_assignment_id, canvas_academic_year,
        created_at, updated_at
      ) VALUES (
        ${noteId}::uuid, ${userId}::uuid, ${title}, '', true,
        ${canvasCourseId ?? null}, ${canvas.canvasModuleId ?? null},
        ${canvas.canvasAssignmentId ?? null}, ${canvasAcademicYear ?? null},
        NOW(), NOW()
      )
    `;
    await addNoteToTree(userId, noteId, parentId ?? null);
    return noteId;
  } catch (err) {
    // unique index conflict — concurrent worker created it first
    if (err.code === '23505' && canvasCourseId != null) {
      const winner = await findCanvasFolder(userId, canvas);
      if (winner.length > 0) return reuseExisting(winner[0].note_id, userId, parentId);
    }
    console.warn(`Failed to create folder "${title}": ${err.message}`);
    return parentId;
  }
}
