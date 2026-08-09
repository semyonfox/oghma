/**
 * Canvas folder deduplication and naming utilities.
 * Handles find-or-create semantics backed by partial unique indexes.
 */

import sql from '../../database/pgsql.js';
import { v4 as uuidv4 } from 'uuid';
export { cleanCourseName, stripHtmlToText } from './content-formatting.js';

// sentinel ID for special Canvas structures
export const ASSIGNMENTS_PARENT_MODULE_ID = -1;

/**
 * A Canvas identity can still exist in a user's Trash. Treat that as an
 * explicit lifecycle fence rather than creating a second, active hierarchy
 * beside it. The user can restore or permanently remove the old course
 * before importing it again.
 */
export class CanvasFolderTrashedError extends Error {
  constructor(noteId) {
    super('Canvas folder is in Trash');
    this.name = 'CanvasFolderTrashedError';
    this.noteId = noteId;
  }
}

// ── Folder deduplication ────────────────────────────────────────────────────

// single query handles all three folder types via conditional column matching
function findCanvasFolder(db, userId, canvas) {
  const { canvasCourseId, canvasModuleId, canvasAssignmentId } = canvas;
  const hasAssignment = canvasAssignmentId != null;
  const hasModule = canvasModuleId != null;
  return db`
    SELECT note_id, deleted_at FROM app.notes
    WHERE user_id = ${userId}::uuid
      AND canvas_course_id = ${canvasCourseId}::bigint
      AND CASE
        WHEN ${hasAssignment} THEN canvas_assignment_id = ${canvasAssignmentId ?? 0}::bigint
        WHEN ${hasModule}     THEN canvas_module_id = ${canvasModuleId ?? 0}::bigint
        ELSE canvas_module_id IS NULL AND canvas_assignment_id IS NULL
      END
      AND is_folder = true
    ORDER BY (deleted_at IS NULL) DESC, updated_at DESC
    LIMIT 1
  `;
}

async function lockUserTree(db, userId) {
  await db`
    SELECT pg_advisory_xact_lock(hashtextextended(${userId}::text, 0))
  `;
}

async function ensureActiveParent(db, userId, parentId) {
  if (!parentId) return;
  const [parent] = await db`
    SELECT note_id
    FROM app.notes
    WHERE note_id = ${parentId}::uuid
      AND user_id = ${userId}::uuid
      AND deleted_at IS NULL
    FOR KEY SHARE
  `;
  if (!parent) throw new CanvasFolderTrashedError(parentId);
}

async function reuseExisting(db, noteId, userId, parentId) {
  await db`
    INSERT INTO app.tree_items (user_id, note_id, parent_id)
    VALUES (${userId}::uuid, ${noteId}::uuid, ${parentId ?? null}::uuid)
    ON CONFLICT (user_id, note_id) DO NOTHING
  `;
  return noteId;
}

export async function findOrCreateFolder(userId, title, parentId, canvas = {}) {
  const { canvasCourseId, canvasAcademicYear } = canvas;

  try {
    return await sql.begin(async (tx) => {
      // Trash takes this exact lock before marking a subtree deleted. Holding
      // it across the active-parent check and tree insert prevents a late
      // Canvas worker from creating children below a deleted course.
      await lockUserTree(tx, userId);
      await ensureActiveParent(tx, userId, parentId);

      if (canvasCourseId != null) {
        const existing = await findCanvasFolder(tx, userId, canvas);
        if (existing.length > 0) {
          if (existing[0].deleted_at) {
            throw new CanvasFolderTrashedError(existing[0].note_id);
          }
          return reuseExisting(tx, existing[0].note_id, userId, parentId);
        }
      }

      const noteId = uuidv4();
      await tx`
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
      await reuseExisting(tx, noteId, userId, parentId);
      return noteId;
    });
  } catch (err) {
    if (err instanceof CanvasFolderTrashedError) throw err;
    // unique index conflict — concurrent worker created it first
    if (err.code === '23505' && canvasCourseId != null) {
      return sql.begin(async (tx) => {
        await lockUserTree(tx, userId);
        await ensureActiveParent(tx, userId, parentId);
        const winner = await findCanvasFolder(tx, userId, canvas);
        if (winner.length > 0) {
          if (winner[0].deleted_at) {
            throw new CanvasFolderTrashedError(winner[0].note_id);
          }
          return reuseExisting(tx, winner[0].note_id, userId, parentId);
        }
        throw err;
      });
    }
    console.warn(`Failed to create folder "${title}": ${err.message}`);
    return parentId;
  }
}
