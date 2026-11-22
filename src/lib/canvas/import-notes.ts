// note rows for imported files, created under the per-user tree lock
import { withCanvasPublication } from "./execution";
import type postgres from "postgres";
import sql from "../../database/pgsql";
import { v4 as uuidv4 } from "uuid";

export interface NoteOptions {
  content?: string;
  isFolder?: boolean;
  s3Key?: string | null;
  canvasImportId?: string | null;
  canvasCourseId?: string | number | null;
  canvasModuleId?: string | number | null;
  canvasAssignmentId?: string | number | null;
  canvasAcademicYear?: string | null;
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export async function lockUserTree(tx: postgres.TransactionSql, userId: string) {
  await tx`
    SELECT pg_advisory_xact_lock(hashtextextended(${userId}::text, 0))
  `;
}

export async function createNote(
  userId: string,
  title: string,
  parentId: string | null,
  opts: NoteOptions = {},
) {
  return withCanvasPublication(async () => {
  const noteId = uuidv4();
  const s3Key = opts.s3Key ?? null;
  const isFolder = opts.isFolder ?? false;
  const content = opts.content ?? "";
  const canvasCourseId = opts.canvasCourseId ?? null;
  const canvasModuleId = opts.canvasModuleId ?? null;
  const canvasAssignmentId = opts.canvasAssignmentId ?? null;
  const canvasAcademicYear = opts.canvasAcademicYear ?? null;
  const canvasImportId = opts.canvasImportId ?? null;
  await sql.begin(async (tx) => {
    // Match the lock held by a Trash transition. A file worker that loses the
    // race cannot create a fresh binary/markdown pair inside a deleted folder.
    await lockUserTree(tx, userId);
    if (parentId) {
      const [parent] = await tx`
        SELECT note_id
        FROM app.notes
        WHERE note_id = ${parentId}::uuid
          AND user_id = ${userId}::uuid
          AND deleted_at IS NULL
        FOR KEY SHARE
      `;
      if (!parent) throw new Error("Parent folder is no longer active");
    }

    await tx`
      INSERT INTO app.notes (
        note_id, user_id, title, content, s3_key, is_folder,
        canvas_course_id, canvas_module_id, canvas_assignment_id, canvas_academic_year, canvas_import_id,
        created_at, updated_at
      )
      VALUES (
        ${noteId}::uuid, ${userId}::uuid, ${title}, ${content}, ${s3Key}, ${isFolder},
        ${canvasCourseId}, ${canvasModuleId}, ${canvasAssignmentId}, ${canvasAcademicYear}, ${canvasImportId}::uuid,
        NOW(), NOW()
      )
    `;
    await tx`
      INSERT INTO app.tree_items (user_id, note_id, parent_id)
      VALUES (${userId}::uuid, ${noteId}::uuid, ${parentId ?? null}::uuid)
      ON CONFLICT (user_id, note_id) DO NOTHING
    `;
  });
  return noteId;

  });
}

// find an existing note by title under a parent, or create a new one
// handles concurrent inserts by catching unique-violation and re-fetching
export async function findOrCreateNote(
  userId: string,
  title: string,
  parentId: string | null,
  opts: NoteOptions = {},
): Promise<{ noteId: string; created: boolean }> {
  return withCanvasPublication(async () => {
  // SQL `= NULL` is always unknown -- split query for null vs non-null parent
  const existing = parentId
    ? await sql<{ note_id: string }[]>`
        SELECT n.note_id FROM app.notes n
        JOIN app.tree_items t ON t.note_id = n.note_id
        WHERE n.user_id = ${userId}::uuid
          AND t.user_id = ${userId}::uuid
          AND n.title = ${title}
          AND n.is_folder = false
          AND n.canvas_import_id IS NOT DISTINCT FROM ${opts.canvasImportId ?? null}::uuid
          AND n.deleted_at IS NULL
          AND t.parent_id = ${parentId}::uuid
        LIMIT 1
      `
    : await sql<{ note_id: string }[]>`
        SELECT n.note_id FROM app.notes n
        JOIN app.tree_items t ON t.note_id = n.note_id
        WHERE n.user_id = ${userId}::uuid
          AND t.user_id = ${userId}::uuid
          AND n.title = ${title}
          AND n.is_folder = false
          AND n.canvas_import_id IS NOT DISTINCT FROM ${opts.canvasImportId ?? null}::uuid
          AND n.deleted_at IS NULL
          AND t.parent_id IS NULL
        LIMIT 1
      `;
  if (existing.length > 0) {
    const noteId = existing[0].note_id;
    // backfill canvas metadata on re-import if not already set
    if (opts.canvasCourseId != null) {
      await sql`
        UPDATE app.notes
        SET canvas_course_id    = COALESCE(canvas_course_id,    ${opts.canvasCourseId}),
            canvas_module_id    = COALESCE(canvas_module_id,    ${opts.canvasModuleId ?? null}),
            canvas_assignment_id = COALESCE(canvas_assignment_id, ${opts.canvasAssignmentId ?? null}),
            updated_at          = NOW()
        WHERE note_id = ${noteId}::uuid AND canvas_course_id IS NULL
      `;
    }
    return { noteId, created: false };
  }
  try {
    const noteId = await createNote(userId, title, parentId, opts);
    return { noteId, created: true };
  } catch (err) {
    // concurrent insert won the race -- re-fetch the winner
    if (isUniqueViolation(err)) {
      const [row] = parentId
        ? await sql<{ note_id: string }[]>`
            SELECT n.note_id FROM app.notes n
            JOIN app.tree_items t ON t.note_id = n.note_id
            WHERE n.user_id = ${userId}::uuid
              AND t.user_id = ${userId}::uuid
              AND n.title = ${title}
              AND n.is_folder = false
              AND n.canvas_import_id IS NOT DISTINCT FROM ${opts.canvasImportId ?? null}::uuid
              AND n.deleted_at IS NULL
              AND t.parent_id = ${parentId}::uuid
            LIMIT 1
          `
        : await sql<{ note_id: string }[]>`
            SELECT n.note_id FROM app.notes n
            JOIN app.tree_items t ON t.note_id = n.note_id
            WHERE n.user_id = ${userId}::uuid
              AND t.user_id = ${userId}::uuid
              AND n.title = ${title}
              AND n.is_folder = false
              AND n.canvas_import_id IS NOT DISTINCT FROM ${opts.canvasImportId ?? null}::uuid
              AND n.deleted_at IS NULL
              AND t.parent_id IS NULL
            LIMIT 1
          `;
      if (row) return { noteId: row.note_id, created: false };
    }
    throw err;
  }

  });
}
