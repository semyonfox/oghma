import type postgres from "postgres";
import sql from "@/database/pgsql";

export interface CreateNoteWithTreeInput {
  noteId: string;
  userId: string;
  title: string;
  content: string;
  isFolder: boolean;
  parentId?: string | null;
  s3Key?: string | null;
  canvasCourseId?: string | number | null;
  canvasModuleId?: string | number | null;
  canvasAssignmentId?: string | number | null;
  canvasAcademicYear?: string | null;
  clonedFrom?: string | null;
  importedFileCacheId?: string | null;
}

export interface CreatedNote {
  noteId: string;
  userId: string;
  title: string;
  content: string;
  isFolder: boolean;
  s3Key: string | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
}

export class InvalidNoteParentError extends Error {
  constructor() {
    super("Parent folder does not exist or is no longer available");
    this.name = "InvalidNoteParentError";
  }
}

interface CreatedNoteRow {
  note_id: string;
  user_id: string;
  title: string;
  content: string;
  is_folder: boolean;
  s3_key: string | null;
  created_at: Date | string | null;
  updated_at: Date | string | null;
}

export type NoteTransaction = postgres.TransactionSql;

/**
 * The transaction-level primitive for workflows that need to add adjacent
 * relational rows (for example an attachment) with the note and tree item.
 */
export async function insertNoteWithTree(
  tx: NoteTransaction,
  input: CreateNoteWithTreeInput,
): Promise<CreatedNote> {
  // Tree moves and lifecycle changes take this same user-scoped lock. Taking
  // it before validating the parent prevents a live child from being inserted
  // below a folder that is concurrently moved to trash.
  await tx`
    SELECT pg_advisory_xact_lock(hashtextextended(${input.userId}::text, 0))
  `;

  const parentId = input.parentId ?? null;
  if (parentId) {
    const parents = await tx<{ note_id: string }[]>`
      SELECT note_id
      FROM app.notes
      WHERE note_id = ${parentId}::uuid
        AND user_id = ${input.userId}::uuid
        AND is_folder = true
        AND deleted_at IS NULL
      FOR SHARE
    `;
    if (parents.length === 0) {
      throw new InvalidNoteParentError();
    }
  }

  const inserted = await tx<CreatedNoteRow[]>`
    INSERT INTO app.notes (
      note_id,
      user_id,
      title,
      content,
      s3_key,
      is_folder,
      canvas_course_id,
      canvas_module_id,
      canvas_assignment_id,
      canvas_academic_year,
      cloned_from,
      imported_file_cache_id,
      created_at,
      updated_at
    ) VALUES (
      ${input.noteId}::uuid,
      ${input.userId}::uuid,
      ${input.title},
      ${input.content},
      ${input.s3Key ?? null},
      ${input.isFolder},
      ${input.canvasCourseId ?? null},
      ${input.canvasModuleId ?? null},
      ${input.canvasAssignmentId ?? null},
      ${input.canvasAcademicYear ?? null},
      ${input.clonedFrom ?? null}::uuid,
      ${input.importedFileCacheId ?? null}::uuid,
      NOW(),
      NOW()
    )
    RETURNING
      note_id,
      user_id,
      title,
      content,
      is_folder,
      s3_key,
      created_at,
      updated_at
  `;

  await tx`
    INSERT INTO app.tree_items (user_id, note_id, parent_id)
    VALUES (
      ${input.userId}::uuid,
      ${input.noteId}::uuid,
      ${parentId}::uuid
    )
  `;

  const note = inserted[0];
  if (!note) {
    throw new Error("Note insert did not return a row");
  }

  return {
    noteId: note.note_id,
    userId: note.user_id,
    title: note.title,
    content: note.content,
    isFolder: note.is_folder,
    s3Key: note.s3_key,
    createdAt: note.created_at,
    updatedAt: note.updated_at,
  };
}

/**
 * Insert a note and its sole tree row as one relational operation. Callers
 * retain ownership of provider-specific work such as object storage,
 * attachments, Canvas metadata discovery, and embeddings.
 */
export async function createNoteWithTree(
  input: CreateNoteWithTreeInput,
): Promise<CreatedNote> {
  const database = sql as postgres.Sql;
  return database.begin((tx) => insertNoteWithTree(tx, input));
}

/**
 * Compensate a newly-created note before any durable dependent rows exist.
 * Deleting the tree row first keeps this safe even where the schema does not
 * enforce cascading tree cleanup.
 */
export async function removeNewNoteWithTree(
  userId: string,
  noteId: string,
): Promise<void> {
  const database = sql as postgres.Sql;
  await database.begin(async (tx) => {
    await tx`
      DELETE FROM app.tree_items
      WHERE user_id = ${userId}::uuid AND note_id = ${noteId}::uuid
    `;
    await tx`
      DELETE FROM app.notes
      WHERE user_id = ${userId}::uuid AND note_id = ${noteId}::uuid
    `;
  });
}
