// upload API route - handles file uploads for note attachments
import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import type postgres from "postgres";
import { checkRateLimit } from "@/lib/rate-limiter";
import { getStorageProvider } from "@/lib/storage/init";
import { ObjectNotFoundError } from "@/lib/storage/base";
import { storedObjectHeaders } from "@/lib/storage/inline-content";
import {
  displayFileName,
  noteAttachmentKey,
  storageFileName,
} from "@/lib/storage/file-names";
import { insertNoteWithTree, InvalidNoteParentError } from "@/lib/notes/storage/create-note";
import { generateUUID, isValidUUID } from "@/lib/utils/uuid";
import { withErrorHandler, tracedError, requireAuth, ApiError } from "@/lib/api-error";
import sql from "@/database/pgsql";
import logger from "@/lib/logger";
import { config } from "@/lib/config";
import { enqueueCanvasJob } from "@/lib/queue";
import { readBoundedBody, BodyTooLargeError } from "@/lib/http/bounded-body";
import { detectMimeType } from "@/lib/ingestion/detect-mime";
import { invalidateTreeAfterPublish } from "@/lib/notes/tree-cache";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "audio/mpeg",
  "audio/wav",
  "video/mp4",
]);

// types the background extractor can turn into text
const EXTRACTABLE_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
]);

// attachments also come from Canvas and vault imports, which store types this
// route never accepts (and legacy objects predate the allowlist). Anything
// outside this set downloads instead of rendering on the app origin
const INLINE_MIME_TYPES: ReadonlySet<string> = new Set([
  ...ALLOWED_MIME_TYPES,
  "application/vnd.ms-powerpoint",
]);

// multipart framing and the noteId field on top of the file itself
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

class NoteUnavailableError extends Error {}

function attachmentStreamUrl(path: string): string {
  return `/api/upload?path=${encodeURIComponent(path)}&stream=1`;
}

async function readUploadForm(request: NextRequest): Promise<FormData> {
  try {
    const bytes = await readBoundedBody(
      request,
      config.upload.maxFileSizeBytes + MULTIPART_OVERHEAD_BYTES,
    );
    return await new Response(bytes, {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch (error) {
    if (error instanceof BodyTooLargeError) throw new ApiError(413, "Upload body too large");
    throw new ApiError(400, "Invalid multipart body");
  }
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth();
  const userId = session.user_id;

  const limited = await checkRateLimit("upload", userId);
  if (limited) return limited;

  const formData = await readUploadForm(request);
  const file = formData.get("file");
  const rawNoteId = formData.get("noteId");
  if (rawNoteId !== null && typeof rawNoteId !== "string") return tracedError("Invalid noteId", 400);
  // a new file can be placed in the same folder as an open note, which is
  // how a PDF dropped into a note lands next to it
  const besideNoteId = formData.get("besideNoteId");
  if (besideNoteId !== null && (typeof besideNoteId !== "string" || !isValidUUID(besideNoteId) || rawNoteId)) {
    return tracedError("Invalid besideNoteId", 400);
  }
  if (!(file instanceof File)) return tracedError("No file provided", 400);

  if (file.size > config.upload.maxFileSizeBytes) {
    return tracedError(
      `File too large (max ${Math.round(config.upload.maxFileSizeBytes / 1024 / 1024)}MB)`,
      400,
    );
  }

  const declaredType = file.type === "application/octet-stream" ? "" : file.type;
  if (declaredType && !ALLOWED_MIME_TYPES.has(declaredType)) {
    return tracedError(`File type '${file.type}' is not allowed`, 400);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const mimeType = detectMimeType(bytes, declaredType, file.name);
  if (!mimeType && declaredType) {
    return tracedError("File content does not match declared type", 400);
  }
  if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) {
    return tracedError("Could not determine an allowed file type", 400);
  }

  const createdNewNote = !rawNoteId;
  const noteId = rawNoteId || generateUUID();
  if (!createdNewNote) {
    if (!isValidUUID(noteId)) return tracedError("Invalid noteId format", 400);
    // cheap pre-check so a bad noteId never costs a storage write; the insert
    // below re-checks inside the transaction
    const exists = await sql`
      SELECT 1 FROM app.notes
      WHERE note_id = ${noteId}::uuid
        AND user_id = ${userId}::uuid
        AND deleted_at IS NULL
      LIMIT 1
    `;
    if (!exists.length) return tracedError("Note not found", 404);
  }

  const title = displayFileName(file.name);
  const fileName = storageFileName(file.name);
  const attachmentId = generateUUID();
  const storagePath = noteAttachmentKey(noteId, attachmentId, fileName);
  const extractable = EXTRACTABLE_MIME_TYPES.has(mimeType);

  const storage = getStorageProvider();
  try {
    await storage.putObject(storagePath, bytes, { contentType: mimeType });
  } catch (s3Error) {
    logger.error("s3 upload failed", { error: s3Error });
    return tracedError("Failed to upload file", 500);
  }

  // the object goes first so a crash can only leave an unreferenced object,
  // never a note or attachment row that points at nothing
  let parentId: string | null = null;
  try {
    await (sql as postgres.Sql).begin(async (tx) => {
      if (createdNewNote) {
        if (besideNoteId) {
          const [sibling] = await tx<{ parent_id: string | null }[]>`
            SELECT t.parent_id
            FROM app.tree_items t
            JOIN app.notes n ON n.note_id = t.note_id AND n.user_id = t.user_id
            WHERE t.note_id = ${besideNoteId}::uuid
              AND t.user_id = ${userId}::uuid
              AND n.deleted_at IS NULL
          `;
          if (!sibling) throw new NoteUnavailableError();
          parentId = sibling.parent_id;
        }
        await insertNoteWithTree(tx, {
          noteId,
          userId,
          title,
          content: "",
          isFolder: false,
          s3Key: storagePath,
          parentId,
        });
      }
      const inserted = await tx`
        INSERT INTO app.attachments (id, note_id, user_id, filename, s3_key, mime_type, file_size)
        SELECT ${attachmentId}::uuid, note.note_id, note.user_id,
               ${fileName}, ${storagePath}, ${mimeType}, ${file.size}
        FROM app.notes note
        WHERE note.note_id = ${noteId}::uuid
          AND note.user_id = ${userId}::uuid
          AND note.deleted_at IS NULL
        RETURNING id
      `;
      if (!inserted.length) throw new NoteUnavailableError();
      if (extractable) {
        // the job row lets the client poll /api/ingestion-status
        await tx`
          INSERT INTO app.ingestion_jobs (note_id, user_id, s3_key, mime_type, status)
          VALUES (${noteId}::uuid, ${userId}::uuid, ${storagePath}, ${mimeType}, 'pending')
          ON CONFLICT DO NOTHING
        `;
      }
    });
  } catch (dbError) {
    await storage.deleteObject(storagePath).catch((s3Err: unknown) => {
      logger.warn("failed to clean up orphaned S3 object", {
        key: storagePath,
        error: s3Err,
      });
    });
    if (dbError instanceof NoteUnavailableError || dbError instanceof InvalidNoteParentError) {
      return tracedError("Note not found", 404);
    }
    logger.warn("failed to record attachment in database", { error: dbError });
    return tracedError("Failed to save file metadata", 500);
  }

  if (createdNewNote) {
    // the new note is durable now, so clear the cached root branch before returning it
    await invalidateTreeAfterPublish(userId, parentId);
  }

  // extraction runs in the worker so the response stays fast regardless of
  // file size or Marker cold-start time
  let ingestionStatus = "not-applicable";
  if (extractable) {
    try {
      await enqueueCanvasJob("extract", {
        noteId,
        userId,
        s3Key: storagePath,
        mimeType,
        // the extracted companion note is titled from this, and
        // /api/ingestion-status pairs the two by title
        filename: title,
      });
      ingestionStatus = "pending";
      logger.info("extraction job queued", { noteId, mimeType });
    } catch (extractErr) {
      ingestionStatus = "failed-to-queue";
      logger.warn("failed to queue extraction job", {
        error: extractErr,
        noteId,
      });
      // nothing will ever claim this row, so stop the client polling it
      await sql`
        UPDATE app.ingestion_jobs
        SET status = 'failed', error = 'Failed to queue extraction', updated_at = NOW()
        WHERE note_id = ${noteId}::uuid
          AND user_id = ${userId}::uuid
          AND s3_key = ${storagePath}
          AND status = 'pending'
      `.catch((updateErr: unknown) => {
        logger.warn("failed to mark unqueued extraction job", {
          error: updateErr,
          noteId,
        });
      });
    }
  }

  return NextResponse.json({
    success: true,
    noteId,
    fileName,
    path: storagePath,
    url: attachmentStreamUrl(storagePath),
    size: file.size,
    type: mimeType,
    ingestionStatus,
    attachmentId,
    createdNewNote,
  });
});

function streamHeaders(
  contentType: string | undefined,
  contentLength: number | undefined,
): Record<string, string> {
  const headers: Record<string, string> = {
    ...storedObjectHeaders(contentType, INLINE_MIME_TYPES),
    "Cache-Control": "private, max-age=300",
  };
  if (contentLength) headers["Content-Length"] = String(contentLength);
  return headers;
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth();

  const path = request.nextUrl.searchParams.get("path");
  if (!path) return tracedError("path query parameter required", 400);

  const owned = await sql`
    SELECT 1
    FROM app.attachments attachment
    JOIN app.notes note
      ON note.note_id = attachment.note_id
     AND note.user_id = attachment.user_id
    WHERE attachment.s3_key = ${path}
      AND attachment.user_id = ${session.user_id}::uuid
      AND note.deleted_at IS NULL
    LIMIT 1
  `;
  if (!owned.length) return tracedError("File not found", 404);

  if (request.nextUrl.searchParams.get("stream") !== "1") {
    return NextResponse.json({ success: true, path, url: attachmentStreamUrl(path) });
  }

  try {
    const { body, contentType, contentLength } =
      await getStorageProvider().getObjectStream(path);
    return new NextResponse(Readable.toWeb(body) as ReadableStream, {
      headers: streamHeaders(contentType, contentLength),
    });
  } catch (streamError) {
    // the attachment row can outlive its object (e.g. migration orphans)
    if (streamError instanceof ObjectNotFoundError) return tracedError("File not found", 404);
    logger.error("failed to stream attachment from storage", {
      key: path,
      error: streamError,
    });
    return tracedError("Failed to read file from storage", 502);
  }
});
