import { NextRequest, NextResponse } from "next/server";
import { filterNoteFields } from "@/lib/notes/utils/filter-fields";
import { mapNoteFromDB } from "@/lib/notes/utils/map-note";
import { cacheGet, cacheSet, cacheInvalidate, cacheKeys } from "@/lib/cache";
import sql from "@/database/pgsql";
import logger from "@/lib/logger";
import { enqueueNoteReindexJob } from "@/lib/queue";
import { noteUpdateSchema, validateBody } from "@/lib/validations/schemas";
import {
  parseJsonObject,
  requireAuth,
  requireValidId,
  tracedError,
  type RouteParamsContext,
  withErrorHandler,
} from "@/lib/api-error";
import { replaceNoteLinks } from "@/lib/notes/storage/note-links";
import { moveSubtreeToTrash } from "@/lib/notes/storage/note-lifecycle";

type NoteRouteContext = RouteParamsContext<{ id: string }>;

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
  pinned: number;
  updated_at: string | Date;
  // text form keeps PostgreSQL's microseconds, so it can fence the UPDATE
  updated_at_raw: string;
}

const MAX_TITLE_LENGTH = parseInt(process.env.MAX_TITLE_LENGTH ?? "500", 10);
const MAX_CONTENT_LENGTH = parseInt(
  process.env.MAX_CONTENT_LENGTH ?? String(5 * 1024 * 1024),
  10,
);

export const GET = withErrorHandler(async (request: NextRequest, { params }: NoteRouteContext) => {
  const user = await requireAuth();

  const { id } = await params;
  const noteId = requireValidId(id, "note ID");

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
  const user = await requireAuth();

  const { id } = await params;
  const noteId = requireValidId(id, "note ID");

  const rawBody = await parseJsonObject(request);

  const bodyValidation = validateBody(noteUpdateSchema, rawBody);
  if (!bodyValidation.success) return bodyValidation.response;
  const body = bodyValidation.data;

  if (body.title !== undefined && body.title.length > MAX_TITLE_LENGTH) {
    logger.warn("note title exceeds max length", {
      length: body.title.length,
      noteId,
    });
    return tracedError(
      `Title must be ${MAX_TITLE_LENGTH} characters or fewer`,
      400,
    );
  }
  if (body.content !== undefined && body.content.length > MAX_CONTENT_LENGTH) {
    logger.warn("note content exceeds max length", {
      length: body.content.length,
      noteId,
    });
    return tracedError(
      `Content must be ${MAX_CONTENT_LENGTH} bytes or fewer`,
      400,
    );
  }

  const startedAt = performance.now();
  const existingRows = (await sql`
    SELECT note_id, title, content, pinned, updated_at, updated_at::text AS updated_at_raw
    FROM app.notes
    WHERE note_id = ${noteId}::uuid
      AND user_id = ${user.user_id}::uuid
      AND deleted_at IS NULL
  `) as NoteContentRow[];

  const existingNote = existingRows[0];
  if (!existingNote) {
    return tracedError("Note not found", 404);
  }

  const conflict = (updatedAt: string) =>
    NextResponse.json(
      { error: "Note changed elsewhere", updatedAt },
      { status: 409 },
    );

  // same normalisation as mapNoteFromDB, so the client compares like with like
  const expectedUpdatedAt = body.expectedUpdatedAt;
  const fenced = expectedUpdatedAt !== undefined;
  const currentUpdatedAt = new Date(existingNote.updated_at).toISOString();
  if (
    expectedUpdatedAt !== undefined &&
    new Date(expectedUpdatedAt).toISOString() !== currentUpdatedAt
  ) {
    return conflict(currentUpdatedAt);
  }

  // a fenced save also refuses to land if the row moved between the read
  // above and this write
  const updatedRows = (await sql`
     UPDATE app.notes
     SET title = ${body.title ?? existingNote.title},
         content = ${body.content ?? existingNote.content},
         pinned = ${body.pinned ?? existingNote.pinned},
         updated_at = NOW()
     WHERE note_id = ${noteId}::uuid
       AND user_id = ${user.user_id}::uuid
       AND deleted_at IS NULL
       AND (${!fenced} OR updated_at = ${existingNote.updated_at_raw}::timestamptz)
     RETURNING note_id, title, content, is_folder, s3_key, shared, pinned, created_at, updated_at
   `) as NoteSummaryRow[];

  const dbNote = updatedRows[0];
  if (!dbNote) {
    if (!fenced) return tracedError("Note not found", 404);
    const [latest] = (await sql`
      SELECT updated_at FROM app.notes
      WHERE note_id = ${noteId}::uuid AND user_id = ${user.user_id}::uuid AND deleted_at IS NULL
    `) as Pick<NoteContentRow, "updated_at">[];
    if (!latest) return tracedError("Note not found", 404);
    return conflict(new Date(latest.updated_at).toISOString());
  }

  const keysToInvalidate = [cacheKeys.note(user.user_id, noteId)];
  if (body.title !== undefined && body.title !== existingNote.title) {
    keysToInvalidate.push(
      cacheKeys.treeFull(user.user_id),
      cacheKeys.notesList(user.user_id, 0, undefined),
    );
  }
  if (body.pinned !== undefined && body.pinned !== existingNote.pinned) {
    keysToInvalidate.push(cacheKeys.treeFull(user.user_id));
  }
  await cacheInvalidate(...keysToInvalidate);

  if (body.content !== undefined && body.content !== existingNote.content) {
    try {
      await replaceNoteLinks(user.user_id, noteId, body.content);
    } catch (linkErr) {
      logger.error("note link index update failed", { noteId, error: linkErr });
    }

    // embedding happens on the worker so the save returns as soon as the row
    // is durable; see reindexNote for the debounce and staleness handling
    try {
      await enqueueNoteReindexJob(noteId, user.user_id);
    } catch (queueErr) {
      logger.error("note reindex enqueue failed", { noteId, error: queueErr });
    }
  }

  const response = NextResponse.json(mapNoteFromDB(dbNote));
  response.headers.set(
    "Server-Timing",
    `save;dur=${(performance.now() - startedAt).toFixed(2)}`,
  );
  return response;
});

export const PATCH = PUT;

export const DELETE = withErrorHandler(async (request: NextRequest, { params }: NoteRouteContext) => {
  const user = await requireAuth();

  const { id } = await params;
  const noteId = requireValidId(id, "note ID");

  const result = await moveSubtreeToTrash(user.user_id, noteId);
  if (!result) return tracedError("Note not found", 404);

  return NextResponse.json({
    success: true,
    rootId: result.rootId,
    itemsMoved: result.noteIds.length,
    purgeAt: result.purgeAt,
  });
});
