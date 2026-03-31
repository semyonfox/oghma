// upload API route - handles file uploads for note attachments
import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimiter";
import { getStorageProvider } from "@/lib/storage/init";
import { isValidUUID } from "@/lib/uuid-validation";
import { addNoteToTree } from "@/lib/notes/storage/pg-tree.js";
import { generateUUID } from "@/lib/utils/uuid";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import sql from "@/database/pgsql";

import { xraySubsegment } from "@/lib/xray";
import logger from "@/lib/logger";
import { config } from "@/lib/config";

function sanitizeFileName(raw: string): string {
  return raw
    .replace(/^\.+/, "") // strip leading dots (hidden files)
    .replace(/[^a-zA-Z0-9._-]/g, "_") // allow only safe chars
    .replace(/\.{2,}/g, ".") // collapse consecutive dots
    .substring(0, 255); // limit length
}

// magic number signatures for file type validation
const MAGIC_NUMBERS: [string, Set<string>][] = [
  ["25504446", new Set(["application/pdf"])], // %PDF
  ["89504e47", new Set(["image/png"])], // PNG
  ["ffd8ff", new Set(["image/jpeg"])], // JPEG
  ["47494638", new Set(["image/gif"])], // GIF
  ["52494646", new Set(["image/webp", "audio/wav"])], // RIFF (WebP, WAV)
  [
    "504b0304",
    new Set([
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ]),
  ], // PK (ZIP-based Office formats)
  ["d0cf11e0", new Set(["application/msword"])], // OLE2 (legacy Office)
  ["494433", new Set(["audio/mpeg"])], // ID3 (MP3)
  ["fff1", new Set(["audio/mpeg"])], // MPEG audio frame
  ["fffb", new Set(["audio/mpeg"])], // MPEG audio frame
  ["00000020", new Set(["video/mp4"])], // MP4 ftyp
  ["0000001c", new Set(["video/mp4"])], // MP4 ftyp variant
];

function validateMagicNumber(buffer: ArrayBuffer, mimeType: string): boolean {
  // text-based formats don't have magic numbers
  if (mimeType.startsWith("text/") || mimeType === "image/svg+xml") return true;

  const header = Buffer.from(buffer).subarray(0, 12).toString("hex");
  for (const [magic, allowedTypes] of MAGIC_NUMBERS) {
    if (header.startsWith(magic)) {
      return allowedTypes.has(mimeType);
    }
  }
  // if no magic number matched and it's not a text format, reject
  return false;
}

const ALLOWED_MIME_TYPES = new Set([
  // documents
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // images
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  // audio/video
  "audio/mpeg",
  "audio/wav",
  "video/mp4",
]);

async function requireSession() {
  const session = await validateSession();
  if (!session) return null;
  return session;
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  try {
    const session = await requireSession();
    if (!session) return tracedError("Unauthorized", 401);

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

    // validate file type against allowlist
    if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
      return tracedError(`File type '${file.type}' is not allowed`, 400);
    }

    // validate file content matches declared MIME type via magic numbers
    const rawBuffer = await file.arrayBuffer();
    if (file.type && !validateMagicNumber(rawBuffer, file.type)) {
      return tracedError("File content does not match declared type", 400);
    }

    let createdNewNote = false;
    if (!noteId) {
      noteId = generateUUID();
      createdNewNote = true;

      const title = sanitizeFileName(file.name || "unnamed");
      try {
        await sql`
                    INSERT INTO app.notes (note_id, user_id, title, content, is_folder, deleted, created_at, updated_at)
                    VALUES (${noteId}::uuid, ${session.user_id}::uuid, ${title}, '', false, 0, NOW(), NOW())
                `;
        await addNoteToTree(session.user_id, noteId, null);
      } catch (dbError) {
        logger.error("failed to create note for uploaded file", {
          error: dbError,
        });
        return tracedError("Failed to create note for file", 500);
      }
    } else if (!isValidUUID(noteId)) {
      return tracedError("Invalid noteId format", 400);
    }

    const fileName = sanitizeFileName(file.name || "unnamed");
    const storagePath = `notes/${noteId}/${fileName}`;

    const storage = getStorageProvider();
    await xraySubsegment("s3-put", () =>
      storage.putObject(storagePath, Buffer.from(rawBuffer), {
        contentType: file.type || "application/octet-stream",
      }),
    );

    const signedUrl = await xraySubsegment("s3-sign-url", () =>
      storage.getSignUrl(storagePath, 300),
    );

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
      // clean up the orphaned S3 object since the DB record failed
      // if this also fails, the object will be caught by S3 lifecycle policy
      try {
        await storage.deleteObject(storagePath);
      } catch (s3Err) {
        logger.warn("failed to clean up orphaned S3 object", {
          key: storagePath,
          error: s3Err,
        });
      }
      return tracedError("Failed to save file metadata", 500);
    }

    if (createdNewNote) {
      try {
        await sql`
                    UPDATE app.notes SET s3_key = ${storagePath}, updated_at = NOW()
                    WHERE note_id = ${noteId}::uuid
                `;
      } catch (updateError) {
        logger.warn("failed to update note with s3_key", {
          error: updateError,
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
  } catch (error) {
    logger.error("upload error", { error });
    return tracedError("Upload failed", 500);
  }
});

export const GET = withErrorHandler(async (request: NextRequest) => {
  try {
    const session = await requireSession();
    if (!session) return tracedError("Unauthorized", 401);

    const path = request.nextUrl.searchParams.get("path");
    if (!path) return tracedError("path query parameter required", 400);

    // verify the requested path belongs to this user via the attachments table
    const owned = await sql`
            SELECT 1 FROM app.attachments
            WHERE s3_key = ${path} AND user_id = ${session.user_id}::uuid
            LIMIT 1
        `;
    if (!owned.length) return tracedError("File not found", 404);

    const storage = getStorageProvider();
    const url = await storage.getSignUrl(path, 300);
    return NextResponse.json({ success: true, path, url });
  } catch (error) {
    logger.error("retrieve error", { error });
    return tracedError("Retrieve failed", 500);
  }
});
