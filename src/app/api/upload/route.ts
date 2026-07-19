// upload API route - handles file uploads for note attachments
import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { checkRateLimit } from "@/lib/rateLimiter";
import { getStorageProvider } from "@/lib/storage/init";
import { addNoteToTree } from "@/lib/notes/storage/pg-tree.js";
import { generateUUID, isValidUUID } from "@/lib/utils/uuid";
import { withErrorHandler, tracedError, requireAuth } from "@/lib/api-error";
import sql from "@/database/pgsql";
import { xraySubsegment } from "@/lib/xray";
import logger from "@/lib/logger";
import { config } from "@/lib/config";
import { enqueueCanvasJob } from "@/lib/queue";

function sanitizeFileName(raw: string): string {
  return raw
    .replace(/^\.+/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.{2,}/g, ".")
    .substring(0, 255);
}

const MAGIC_NUMBERS: [string, Set<string>][] = [
  ["25504446", new Set(["application/pdf"])],
  ["89504e47", new Set(["image/png"])],
  ["ffd8ff", new Set(["image/jpeg"])],
  ["47494638", new Set(["image/gif"])],
  ["52494646", new Set(["image/webp", "audio/wav"])],
  [
    "504b0304",
    new Set([
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ]),
  ],
  ["d0cf11e0", new Set(["application/msword"])],
  ["494433", new Set(["audio/mpeg"])],
  ["fff1", new Set(["audio/mpeg"])],
  ["fffb", new Set(["audio/mpeg"])],
  ["00000020", new Set(["video/mp4"])],
  ["0000001c", new Set(["video/mp4"])],
];

function validateMagicNumber(buffer: ArrayBuffer, mimeType: string): boolean {
  if (mimeType.startsWith("text/")) return true;
  const header = Buffer.from(buffer).subarray(0, 12).toString("hex");
  for (const [magic, allowedTypes] of MAGIC_NUMBERS) {
    if (header.startsWith(magic)) {
      return allowedTypes.has(mimeType);
    }
  }
  return false;
}

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

export const POST = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth();

  const limited = await checkRateLimit("upload", session.user_id);
  if (limited) return limited;

  const formData = await request.formData();
  const file = formData.get("file") as File;
  let noteId = formData.get("noteId") as string;

  if (!file) return tracedError("No file provided", 400);

  if (file.size > config.upload.maxFileSizeBytes) {
    return tracedError(
      `File too large (max ${Math.round(config.upload.maxFileSizeBytes / 1024 / 1024)}MB)`,
      400,
    );
  }

  if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
    return tracedError(`File type '${file.type}' is not allowed`, 400);
  }

  const rawBuffer = await file.arrayBuffer();
  if (file.type && !validateMagicNumber(rawBuffer, file.type)) {
    return tracedError("File content does not match declared type", 400);
  }

  let createdNewNote = false;
  if (!noteId) {
    noteId = generateUUID();
    createdNewNote = true;

    const title = sanitizeFileName(file.name || "unnamed");
    await sql`
      INSERT INTO app.notes (note_id, user_id, title, content, is_folder, created_at, updated_at)
      VALUES (${noteId}::uuid, ${session.user_id}::uuid, ${title}, '', false, NOW(), NOW())
    `;
    await addNoteToTree(session.user_id, noteId, null);
  } else if (!isValidUUID(noteId)) {
    return tracedError("Invalid noteId format", 400);
  } else {
    const exists = await sql`
      SELECT 1 FROM app.notes
      WHERE note_id = ${noteId}::uuid
        AND user_id = ${session.user_id}::uuid
        AND deleted_at IS NULL
      LIMIT 1
    `;
    if (!exists.length) return tracedError("Note not found", 404);
  }

  const fileName = sanitizeFileName(file.name || "unnamed");
  const storagePath = `notes/${noteId}/${fileName}`;

  const storage = getStorageProvider();
  try {
    await xraySubsegment("s3-put", () =>
      storage.putObject(storagePath, Buffer.from(rawBuffer), {
        contentType: file.type || "application/octet-stream",
      }),
    );
  } catch (s3Error) {
    if (createdNewNote) {
      await sql`DELETE FROM app.notes WHERE note_id = ${noteId}::uuid`.catch(
        () => {},
      );
    }
    logger.error("s3 upload failed", { error: s3Error });
    return tracedError("Failed to upload file", 500);
  }

  const signedUrl = `/api/upload?path=${encodeURIComponent(storagePath)}&stream=1`;

  const attachmentId = generateUUID();
  try {
    await sql`
      INSERT INTO app.attachments (id, note_id, user_id, filename, s3_key, mime_type, file_size)
      VALUES (${attachmentId}::uuid, ${noteId}::uuid, ${session.user_id}::uuid,
              ${fileName}, ${storagePath}, ${file.type || "application/octet-stream"}, ${file.size})
    `;
  } catch (dbError) {
    logger.warn(
      "failed to record attachment in database, cleaning up S3 object",
      { error: dbError },
    );
    try {
      await storage.deleteObject(storagePath);
    } catch (s3Err) {
      logger.warn("failed to clean up orphaned S3 object", {
        key: storagePath,
        error: s3Err,
      });
    }
    if (createdNewNote) {
      await sql`DELETE FROM app.notes WHERE note_id = ${noteId}::uuid`.catch(
        () => {},
      );
    }
    return tracedError("Failed to save file metadata", 500);
  }

  if (createdNewNote) {
    try {
      await sql`UPDATE app.notes SET s3_key = ${storagePath}, updated_at = NOW() WHERE note_id = ${noteId}::uuid AND user_id = ${session.user_id}::uuid`;
    } catch (updateError) {
      logger.warn("failed to update note with s3_key", { error: updateError });
    }
  }

  // queue extraction for extractable file types via SQS → ECS worker
  // keeps upload response fast regardless of file size or Marker cold-start time
  const extractableTypes = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/markdown",
    "text/x-markdown",
  ]);

  if (extractableTypes.has(file.type)) {
    try {
      // insert job record so frontend can poll /api/ingestion-status
      await sql`
        INSERT INTO app.ingestion_jobs (note_id, user_id, s3_key, mime_type, status)
        VALUES (${noteId}::uuid, ${session.user_id}::uuid, ${storagePath}, ${file.type || "application/pdf"}, 'pending')
        ON CONFLICT DO NOTHING
      `;

      await enqueueCanvasJob("extract", {
        noteId,
        userId: session.user_id,
        s3Key: storagePath,
        mimeType: file.type || "application/pdf",
        filename: fileName,
      });

      logger.info("extraction job queued", { noteId, mimeType: file.type });
    } catch (extractErr) {
      logger.warn("failed to queue extraction job", {
        error: extractErr,
        noteId,
      });
    }
  }

  return NextResponse.json({
    success: true,
    noteId,
    fileName,
    path: storagePath,
    url: signedUrl,
    size: file.size,
    type: file.type,
    attachmentId,
    createdNewNote,
  });
});

export const GET = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth();
  const storage = getStorageProvider();

  const path = request.nextUrl.searchParams.get("path");
  if (!path) return tracedError("path query parameter required", 400);

  const owned = await sql`
    SELECT 1 FROM app.attachments
    WHERE s3_key = ${path} AND user_id = ${session.user_id}::uuid
    LIMIT 1
  `;
  if (!owned.length) return tracedError("File not found", 404);

  if (request.nextUrl.searchParams.get("stream") === "1") {
    // attachment row may exist while the blob is gone (e.g. migration orphans)
    if (!(await storage.hasObject(path))) {
      return tracedError("File not found", 404);
    }
    try {
      const { body, contentType, contentLength } = await storage.getObjectStream(path);
      const headers: Record<string, string> = {
        // SVG is active XML. Legacy objects may predate the upload policy, so
        // never render one as a same-origin document.
        "Content-Type": contentType === "image/svg+xml" ? "application/octet-stream" : (contentType ?? "application/octet-stream"),
        "Cache-Control": "private, max-age=300",
      };
      if (contentType === "image/svg+xml") {
        headers["Content-Disposition"] = "attachment";
        headers["Content-Security-Policy"] = "sandbox";
      }
      if (contentLength) headers["Content-Length"] = String(contentLength);
      return new NextResponse(Readable.toWeb(body) as ReadableStream, { headers });
    } catch (streamError) {
      logger.error("failed to stream attachment from storage", {
        key: path,
        error: streamError,
      });
      return tracedError("Failed to read file from storage", 502);
    }
  }

  const url = `/api/upload?path=${encodeURIComponent(path)}&stream=1`;
  return NextResponse.json({ success: true, path, url });
});
