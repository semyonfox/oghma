/**
 * Canvas folder deduplication and naming utilities.
 * Handles find-or-create semantics backed by partial unique indexes.
 */

import type postgres from "postgres";
import sql from "../../database/pgsql";
import { v4 as uuidv4 } from "uuid";
import { invalidateTreeAfterPublish } from "@/lib/notes/tree-cache";
export { cleanCourseName, stripHtmlToText } from "./content-formatting";

interface CanvasFolderIdentity {
  canvasCourseId?: string | number | null;
  canvasModuleId?: string | number | null;
  canvasAssignmentId?: string | number | null;
  canvasAcademicYear?: string | null;
}

interface CanvasFolderRow {
  note_id: string;
  deleted_at: Date | string | null;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const ASSIGNMENTS_PARENT_MODULE_ID = -1;

/** A trashed Canvas hierarchy is a lifecycle fence, not a duplicate target. */
export class CanvasFolderTrashedError extends Error {
  readonly noteId: string;

  constructor(noteId: string) {
    super("Canvas folder is in Trash");
    this.name = "CanvasFolderTrashedError";
    this.noteId = noteId;
  }
}

async function findCanvasFolder(
  db: postgres.TransactionSql,
  userId: string,
  canvas: CanvasFolderIdentity,
): Promise<CanvasFolderRow[]> {
  const { canvasCourseId, canvasModuleId, canvasAssignmentId } = canvas;
  const hasAssignment = canvasAssignmentId != null;
  const hasModule = canvasModuleId != null;
  return db<CanvasFolderRow[]>`
    SELECT note_id, deleted_at FROM app.notes
    WHERE user_id = ${userId}::uuid
      AND canvas_course_id = ${canvasCourseId ?? null}::bigint
      AND CASE
        WHEN ${hasAssignment} THEN canvas_assignment_id = ${canvasAssignmentId ?? 0}::bigint
        WHEN ${hasModule} THEN canvas_module_id = ${canvasModuleId ?? 0}::bigint
        ELSE canvas_module_id IS NULL AND canvas_assignment_id IS NULL
      END
      AND is_folder = true
    ORDER BY (deleted_at IS NULL) DESC, updated_at DESC
    LIMIT 1
  `;
}

async function lockUserTree(db: postgres.TransactionSql, userId: string): Promise<void> {
  await db`
    SELECT pg_advisory_xact_lock(hashtextextended(${userId}::text, 0))
  `;
}

async function ensureActiveParent(
  db: postgres.TransactionSql,
  userId: string,
  parentId: string | null,
): Promise<void> {
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

async function reuseExisting(
  db: postgres.TransactionSql,
  noteId: string,
  userId: string,
  parentId: string | null,
): Promise<string> {
  await db`
    INSERT INTO app.tree_items (user_id, note_id, parent_id)
    VALUES (${userId}::uuid, ${noteId}::uuid, ${parentId ?? null}::uuid)
    ON CONFLICT (user_id, note_id) DO NOTHING
  `;
  return noteId;
}

export async function findOrCreateFolder(
  userId: string,
  title: string,
  parentId: string | null,
  canvas: CanvasFolderIdentity = {},
): Promise<string | null> {
  const { canvasCourseId, canvasAcademicYear } = canvas;

  try {
    const folderId = await sql.begin(async (tx) => {
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
    await invalidateTreeAfterPublish(userId, parentId);
    return folderId;
  } catch (error) {
    if (error instanceof CanvasFolderTrashedError) throw error;
    // Unique index conflict: a concurrent worker won the creation race.
    if (isUniqueViolation(error) && canvasCourseId != null) {
      const folderId = await sql.begin(async (tx) => {
        await lockUserTree(tx, userId);
        await ensureActiveParent(tx, userId, parentId);
        const winner = await findCanvasFolder(tx, userId, canvas);
        if (winner.length > 0) {
          if (winner[0].deleted_at) {
            throw new CanvasFolderTrashedError(winner[0].note_id);
          }
          return reuseExisting(tx, winner[0].note_id, userId, parentId);
        }
        throw error;
      });
      await invalidateTreeAfterPublish(userId, parentId);
      return folderId;
    }
    console.warn(`Failed to create folder "${title}": ${errorMessage(error)}`);
    return parentId;
  }
}
