import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { isValidUUID } from "@/lib/utils/uuid";
import { removeNoteFromTree } from "@/lib/notes/storage/pg-tree.js";
import { deleteNoteAnnotations } from "@/lib/notes/storage/pdf-annotations.js";
import { filterNoteFields } from "@/lib/notes/utils/filter-fields";
import { mapNoteFromDB } from "@/lib/notes/utils/map-note";
import { cacheGet, cacheSet, cacheInvalidate, cacheKeys } from "@/lib/cache";
import sql from "@/database/pgsql.js";
import logger from "@/lib/logger";
import { chunkText } from "@/lib/chunking";
import { deleteNoteRagIndex, replaceNoteEmbeddings } from "@/lib/rag/indexing";
import { processExtractedText } from "@/lib/canvas/text-processing";
import { noteUpdateSchema, validateBody } from "@/lib/validations/schemas";
import { withErrorHandler, tracedError } from "@/lib/api-error";

interface NoteRouteParams {
  id: string;
}

type NoteRouteContext = {
  params: Promise<NoteRouteParams>;
};

interface NoteSummaryRow {
  note_id: string;
  title: string;
  content: string;
  is_folder: boolean;
  s3_key: string | null;
  mime_type: string | null;
  shared: number;
  pinned: number;
  created_at: string;
  updated_at: string;
}

interface NoteContentRow {
  note_id: string;
  title: string;
  content: string;
  extracted_text: string | null;
}

const MAX_TITLE_LENGTH = parseInt(process.env.MAX_TITLE_LENGTH ?? "500", 10);
const MAX_CONTENT_LENGTH = parseInt(
  process.env.MAX_CONTENT_LENGTH ?? String(5 * 1024 * 1024),
  10,
);

export const GET = withErrorHandler(async (request: NextRequest, { params }: NoteRouteContext) => {
  const user = await validateSession();
  if (!user) {
    return tracedError("Unauthorized", 401);
  }

  const { id } = await params;
  const noteId = id;

  if (!isValidUUID(noteId)) {
    return tracedError("Invalid note ID", 400);
  }

  const url = new URL(request.url);
  const fieldsParam = url.searchParams.get("fields");
  const fields = fieldsParam
    ? fieldsParam.split(",").map((f) => f.trim())
    : undefined;

  const key = cacheKeys.note(user.user_id, noteId);
  const cached = await cacheGet(key);
  if (cached) {
    return NextResponse.json(filterNoteFields(cached, fields));
  }

  const rows = (await sql`
     SELECT n.note_id, n.title, n.content, n.is_folder, n.s3_key, n.shared, n.pinned,
            n.created_at, n.updated_at,
            (SELECT a.mime_type FROM app.attachments a
             WHERE a.note_id = n.note_id AND a.user_id = n.user_id AND a.s3_key = n.s3_key
             LIMIT 1) AS mime_type
     FROM app.notes n
     WHERE n.note_id = ${noteId}::uuid
       AND n.user_id = ${user.user_id}::uuid
       AND n.deleted_at IS NULL
   `) as NoteSummaryRow[];

  const dbNote = rows[0];
  if (!dbNote) {
    return tracedError("Note not found", 404);
  }

  const note = mapNoteFromDB(dbNote);
  await cacheSet(key, note, 600);

  return NextResponse.json(filterNoteFields(note, fields));
});

export const PUT = withErrorHandler(async (request: NextRequest, { params }: NoteRouteContext) => {
  const user = await validateSession();
  if (!user) {
    return tracedError("Unauthorized", 401);
  }

  const { id } = await params;
  const noteId = id;

  if (!isValidUUID(noteId)) {
    return tracedError("Invalid note ID", 400);
  }

  const rawBody = await request.json();

  const bodyValidation = validateBody(noteUpdateSchema, rawBody);
  if (!bodyValidation.success) return bodyValidation.response;
  const body = bodyValidation.data;

  if (body.title && body.title.length > MAX_TITLE_LENGTH) {
    logger.warn("note title exceeds max length", {
      length: body.title.length,
      noteId,
    });
    return tracedError(
      `Title must be ${MAX_TITLE_LENGTH} characters or fewer`,
      400,
    );
  }
  if (body.content && body.content.length > MAX_CONTENT_LENGTH) {
    logger.warn("note content exceeds max length", {
      length: body.content.length,
      noteId,
    });
    return tracedError(
      `Content must be ${MAX_CONTENT_LENGTH} bytes or fewer`,
      400,
    );
  }

  const existingRows = (await sql`
    SELECT note_id, title, content, extracted_text
    FROM app.notes
    WHERE note_id = ${noteId}::uuid
      AND user_id = ${user.user_id}::uuid
      AND deleted_at IS NULL
  `) as NoteContentRow[];

  const existingNote = existingRows[0];
  if (!existingNote) {
    return tracedError("Note not found", 404);
  }

  const updatedRows = (await sql`
     UPDATE app.notes
     SET title = ${body.title || existingNote.title},
         content = ${body.content || existingNote.content},
         updated_at = NOW()
     WHERE note_id = ${noteId}::uuid AND user_id = ${user.user_id}::uuid
     RETURNING note_id, title, content, is_folder, s3_key, shared, pinned, created_at, updated_at
   `) as NoteSummaryRow[];

  const keysToInvalidate = [cacheKeys.note(user.user_id, noteId)];
  if (body.title && body.title !== existingNote.title) {
    keysToInvalidate.push(
      cacheKeys.treeFull(user.user_id),
      cacheKeys.notesList(user.user_id, 0, undefined),
    );
  }
  await cacheInvalidate(...keysToInvalidate);

  if (body.content && body.content !== existingNote.content) {
    const cleanedText = processExtractedText(body.content);
    if (cleanedText !== (existingNote.extracted_text ?? "")) {
      try {
        await replaceNoteEmbeddings(noteId, user.user_id, chunkText(body.content));
        await sql`
          UPDATE app.notes
          SET extracted_text = ${cleanedText}
          WHERE note_id = ${noteId}::uuid
        `;
      } catch (embedErr) {
        logger.error("note embed error", { noteId, error: embedErr });
      }
    }
  }

  const dbNote = updatedRows[0];
  return NextResponse.json(mapNoteFromDB(dbNote));
});

export const PATCH = PUT;

export const DELETE = withErrorHandler(async (request: NextRequest, { params }: NoteRouteContext) => {
  const user = await validateSession();
  if (!user) {
    return tracedError("Unauthorized", 401);
  }

  const { id } = await params;
  const noteId = id;

  if (!isValidUUID(noteId)) {
    return tracedError("Invalid note ID", 400);
  }

  const result = (await sql`
    SELECT note_id FROM app.notes
    WHERE note_id = ${noteId}::uuid
      AND user_id = ${user.user_id}::uuid
      AND deleted_at IS NULL
  `) as Array<{ note_id: string }>;

  if (result.length === 0) {
    return tracedError("Note not found", 404);
  }

  const parentRow = (await sql`
    SELECT parent_id
    FROM app.tree_items
    WHERE user_id = ${user.user_id}::uuid AND note_id = ${noteId}::uuid
  `) as Array<{ parent_id: string | null }>;
  const parentId = parentRow[0]?.parent_id || null;

  await sql`
    UPDATE app.notes
    SET deleted_at = NOW()
    WHERE note_id = ${noteId}::uuid AND user_id = ${user.user_id}::uuid
  `;

  await removeNoteFromTree(user.user_id, noteId);
  await deleteNoteAnnotations(user.user_id, noteId);

  try {
    await deleteNoteRagIndex(noteId, user.user_id);
  } catch (error) {
    logger.warn("note RAG index cleanup failed during soft delete", {
      noteId,
      error,
    });
  }

  await cacheInvalidate(
    cacheKeys.note(user.user_id, noteId),
    cacheKeys.treeChildren(user.user_id, parentId),
    cacheKeys.treeFull(user.user_id),
    cacheKeys.notesList(user.user_id, 0, undefined),
  );

  return NextResponse.json({ success: true });
});
