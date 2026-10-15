import { NextRequest, NextResponse } from "next/server";
import { filterNoteFields } from "@/lib/notes/utils/filter-fields";
import { mapNoteFromDB } from "@/lib/notes/utils/map-note";
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
import { assertNoteLengths, MAX_NOTE_BODY_BYTES } from "@/lib/notes/note-limits";

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

interface PreviousNoteRow {
  title: string;
  content: string;
  pinned: number;
  updated_at: string | Date;
}

export const GET = withErrorHandler(async (request: NextRequest, { params }: NoteRouteContext) => {
  const user = await requireAuth();

  const { id } = await params;
  const noteId = requireValidId(id, "note ID");

  const url = new URL(request.url);
  const fieldsParam = url.searchParams.get("fields");
  const fields = fieldsParam
    ? fieldsParam.split(",").map((f) => f.trim())
    : undefined;

  // no Redis copy here: workers (extraction, Vault import, Canvas) write note
  // content directly, and a stale copy opened in the editor gets autosaved
  // back over the newer row. one primary-key read is cheap enough.
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

  return NextResponse.json(filterNoteFields(mapNoteFromDB(dbNote), fields));
});

export const PUT = withErrorHandler(async (request: NextRequest, { params }: NoteRouteContext) => {
  const user = await requireAuth();

  const { id } = await params;
  const noteId = requireValidId(id, "note ID");

  const rawBody = await parseJsonObject(request, MAX_NOTE_BODY_BYTES);

  const bodyValidation = validateBody(noteUpdateSchema, rawBody);
  if (!bodyValidation.success) return bodyValidation.response;
  const body = bodyValidation.data;
  assertNoteLengths(body);

  const startedAt = performance.now();
  const expectedUpdatedAt = body.expectedUpdatedAt;

  // the row lock makes the fence check and the previous values match what this
  // update replaced, and omitted fields keep the stored value instead of a
  // pre-read copy, so a rename racing an autosave cannot write old content back
  const result = await sql.begin(async (tx) => {
    const [previous] = await tx<PreviousNoteRow[]>`
      SELECT title, content, pinned, updated_at
      FROM app.notes
      WHERE note_id = ${noteId}::uuid
        AND user_id = ${user.user_id}::uuid
        AND deleted_at IS NULL
      FOR UPDATE
    `;
    if (!previous) return { kind: "missing" as const };

    // same normalisation as mapNoteFromDB, so the client compares like with like
    const currentUpdatedAt = new Date(previous.updated_at).toISOString();
    if (
      expectedUpdatedAt !== undefined &&
      new Date(expectedUpdatedAt).toISOString() !== currentUpdatedAt
    ) {
      return { kind: "conflict" as const, updatedAt: currentUpdatedAt };
    }

    const [row] = await tx<NoteSummaryRow[]>`
      UPDATE app.notes
      SET title = COALESCE(${body.title ?? null}::text, title),
          content = COALESCE(${body.content ?? null}::text, content),
          pinned = COALESCE(${body.pinned ?? null}::int, pinned),
          updated_at = NOW()
      WHERE note_id = ${noteId}::uuid
        AND user_id = ${user.user_id}::uuid
      RETURNING note_id, title, content, is_folder, s3_key, shared, pinned, created_at, updated_at
    `;
    return row ? { kind: "updated" as const, previous, row } : { kind: "missing" as const };
  });

  if (result.kind === "missing") return tracedError("Note not found", 404);
  if (result.kind === "conflict") {
    return NextResponse.json(
      { error: "Note changed elsewhere", updatedAt: result.updatedAt },
      { status: 409 },
    );
  }
  const { previous, row: dbNote } = result;

  if (body.content !== undefined && body.content !== previous.content) {
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
