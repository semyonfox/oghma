// upload API route - handles file uploads for note attachments
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rateLimiter";
import { getStorageProvider } from "@/lib/storage/init";
import { addNoteToTree } from "@/lib/notes/storage/pg-tree.js";
import { generateUUID, isValidUUID } from "@/lib/utils/uuid";
import { withErrorHandler, tracedError, requireAuth } from "@/lib/api-error";
import sql from "@/database/pgsql";
import { xraySubsegment } from "@/lib/xray";
import logger from "@/lib/logger";
import { config } from "@/lib/config";

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
  if (mimeType.startsWith("text/") || mimeType === "image/svg+xml") return true;
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
  "image/svg+xml",
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
      INSERT INTO app.notes (note_id, user_id, title, content, is_folder, deleted, created_at, updated_at)
      VALUES (${noteId}::uuid, ${session.user_id}::uuid, ${title}, '', false, 0, NOW(), NOW())
    `;
    await addNoteToTree(session.user_id, noteId, null);
  } else if (!isValidUUID(noteId)) {
    return tracedError("Invalid noteId format", 400);
  } else {
    const exists = await sql`
      SELECT 1 FROM app.notes
      WHERE note_id = ${noteId}::uuid AND user_id = ${session.user_id}::uuid
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

  const signedUrl = await xraySubsegment("s3-sign-url", () =>
    storage.getSignUrl(storagePath, 300),
  );
  const extractionSignedUrl = await storage.getSignUrl(storagePath, 1800);

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
      await sql`UPDATE app.notes SET s3_key = ${storagePath}, updated_at = NOW() WHERE note_id = ${noteId}::uuid`;
    } catch (updateError) {
      logger.warn("failed to update note with s3_key", { error: updateError });
    }
  }

  // trigger extraction for extractable file types
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
      const appUrl = process.env.NEXT_PUBLIC_APP_URL?.startsWith("http")
        ? process.env.NEXT_PUBLIC_APP_URL
        : `https://${process.env.NEXT_PUBLIC_APP_URL}`;
      const extractUrl = new URL("/api/extract", appUrl).toString();
      await fetch(extractUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: request.headers.get("cookie") ?? "",
        },
        body: JSON.stringify({ url: extractionSignedUrl, documentId: noteId }),
      });
    } catch (extractErr) {
      logger.warn("failed to trigger extraction", { error: extractErr });
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

  const path = request.nextUrl.searchParams.get("path");
  if (!path) return tracedError("path query parameter required", 400);

  const owned = await sql`
    SELECT 1 FROM app.attachments
    WHERE s3_key = ${path} AND user_id = ${session.user_id}::uuid
    LIMIT 1
  `;
  if (!owned.length) return tracedError("File not found", 404);

  const storage = getStorageProvider();
  const url = await storage.getSignUrl(path, 300);
  return NextResponse.json({ success: true, path, url });
});
