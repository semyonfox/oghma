import { NextResponse } from "next/server";
import { withErrorHandler, requireAuth, ApiError } from "@/lib/api-error";
import { addNoteToTree } from "@/lib/notes/storage/pg-tree.js";
import { generateUUID } from "@/lib/utils/uuid";
import { filterNoteFields } from "@/lib/notes/utils/filter-fields";
import { mapNoteFromDB } from "@/lib/notes/utils/map-note";
import { cacheGet, cacheSet, cacheInvalidate, cacheKeys } from "@/lib/cache";
import sql from "@/database/pgsql.js";
import logger from "@/lib/logger";
import { noteCreateSchema, validateBody } from "@/lib/validations/schemas";
import { replaceNoteLinks } from "@/lib/notes/storage/note-links";

// Constants
const MAX_TITLE_LENGTH = parseInt(process.env.MAX_TITLE_LENGTH ?? "500", 10);
const MAX_CONTENT_LENGTH = parseInt(
  process.env.MAX_CONTENT_LENGTH ?? String(5 * 1024 * 1024),
  10,
);

export const GET = withErrorHandler(async (request) => {
  const user = await requireAuth();

  // Parse query parameters
  const url = new URL(request.url);
  const fieldsParam = url.searchParams.get("fields");
  const skipParam = url.searchParams.get("skip");
  const limitParam = url.searchParams.get("limit");
  const query = url.searchParams.get("q")?.trim().slice(0, 200) || null;

  // Parse fields from comma-separated string
  const fields = fieldsParam
    ? fieldsParam.split(",").map((f) => f.trim())
    : undefined;

  // Parse pagination
  const parsedSkip = skipParam ? parseInt(skipParam, 10) : 0;
  const parsedLimit = limitParam ? parseInt(limitParam, 10) : undefined;
  const skip = Number.isFinite(parsedSkip) && parsedSkip >= 0 ? parsedSkip : 0;
  const limit =
    parsedLimit !== undefined && Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 200)
      : undefined;

  // check cache for this page (before field filtering)
  const listKey = cacheKeys.notesList(user.user_id, skip, limit);
  const cachedList = query ? null : await cacheGet(listKey);
  if (!query && cachedList) {
    const filtered = cachedList.map((note) => filterNoteFields(note, fields));
    return NextResponse.json(filtered);
  }

  // Get user's notes from PostgreSQL with SQL-level pagination
  // content is excluded from the list query — fetch individual notes for full content
  const sqlLimit = query ? 50 : (limit ?? 200);
  const searchPattern = query ? `%${query}%` : null;
  const notes = await sql`
    SELECT n.note_id, n.title, n.is_folder, n.s3_key, n.shared, n.pinned,
           n.created_at, n.updated_at,
           (SELECT a.mime_type FROM app.attachments a
            WHERE a.note_id = n.note_id AND a.user_id = n.user_id AND a.s3_key = n.s3_key
            LIMIT 1) AS mime_type
    FROM app.notes n
    WHERE n.user_id = ${user.user_id}::uuid
      AND n.deleted_at IS NULL
      AND (${searchPattern}::text IS NULL OR n.title ILIKE ${searchPattern})
    ORDER BY n.created_at DESC
    LIMIT ${sqlLimit} OFFSET ${skip}
  `;

  // Map to NoteModel format and cache full list (pre-field-filter)
  const mapped = notes.map(mapNoteFromDB);
  if (!query) await cacheSet(listKey, mapped, 120);

  // Filter fields if requested
  const filtered = mapped.map((note) => filterNoteFields(note, fields));

  return NextResponse.json(filtered);
});

export const POST = withErrorHandler(async (request) => {
  const user = await requireAuth();

  const rawBody = await request.json();

  // validate input shape
  const validation = validateBody(noteCreateSchema, rawBody);
  if (!validation.success) return validation.response;
  const body = validation.data;

  // validate input lengths
  if (body.title && body.title.length > MAX_TITLE_LENGTH) {
    logger.warn("note title exceeds max length", {
      length: body.title.length,
    });
    throw new ApiError(400, `Title must be ${MAX_TITLE_LENGTH} characters or fewer`);
  }
  if (body.content && body.content.length > MAX_CONTENT_LENGTH) {
    logger.warn("note content exceeds max length", {
      length: body.content.length,
    });
    throw new ApiError(400, `Content must be ${MAX_CONTENT_LENGTH} bytes or fewer`);
  }

  // The notes UI creates an optimistic UUID before POSTing so its tree item and
  // route point at the same persisted note. API-only callers may omit it.
  const noteId = body.id || generateUUID();

  // Create new note in PostgreSQL
  const isFolder = body.isFolder === true || body.is_folder === true;
  const result = await sql`
    INSERT INTO app.notes (note_id, user_id, title, content, is_folder, created_at, updated_at)
    VALUES (${noteId}::uuid, ${user.user_id}::uuid, ${body.title || (isFolder ? "New Folder" : "Untitled")}, ${body.content || "\n"}, ${isFolder}, NOW(), NOW())
    RETURNING note_id, user_id, title, content, is_folder, created_at, updated_at
  `;

  const note = result[0];

  // Add note to tree with optional parent_id from request body
  // If pid is provided, use it; otherwise add to root (parent_id = null)
  const parentId = body.pid || null;
  await addNoteToTree(user.user_id, note.note_id, parentId);

  if (body.content) {
    try {
      await replaceNoteLinks(user.user_id, note.note_id, body.content);
    } catch (linkErr) {
      logger.error("note link index creation failed", {
        noteId: note.note_id,
        error: linkErr,
      });
    }
  }

  // invalidate tree + note list caches
  await cacheInvalidate(
    cacheKeys.treeChildren(user.user_id, parentId),
    cacheKeys.treeFull(user.user_id),
    cacheKeys.notesList(user.user_id, 0, undefined),
  );

  return NextResponse.json(
    {
      id: note.note_id,
      title: note.title,
      content: note.content,
      isFolder: note.is_folder,
      pid: parentId || undefined,
      deleted: 0, // NOTE_DELETED.NORMAL
      shared: 0, // NOTE_SHARE.PRIVATE
      pinned: 0, // NOTE_PINNED.UNPINNED
      editorsize: null,
      createdAt: note.created_at
        ? new Date(note.created_at).toISOString()
        : undefined,
      updatedAt: note.updated_at
        ? new Date(note.updated_at).toISOString()
        : undefined,
    },
    { status: 201 },
  );
});
