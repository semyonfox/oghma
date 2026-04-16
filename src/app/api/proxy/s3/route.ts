import { NextRequest, NextResponse } from "next/server";
import { getStorageProvider } from "@/lib/storage/init";
import {
  requireAuth,
  tracedError,
  withErrorHandler,
} from "@/lib/api-error";
import sql from "@/database/pgsql";
import logger from "@/lib/logger";

/**
 * Proxy endpoint for S3 file access
 * Allows browser to fetch files from S3 without CORS issues by proxying through our server
 * 
 * Query params:
 * - path: S3 key to fetch (required)
 * - inline: true to serve with inline content-disposition (default), false for attachment
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth();

  const path = request.nextUrl.searchParams.get("path");
  const inline = request.nextUrl.searchParams.get("inline") !== "false";

  if (!path) {
    return tracedError("path query parameter required", 400);
  }

  // Verify user owns this file
  const owned = await sql`
    SELECT mime_type, filename FROM app.attachments
    WHERE s3_key = ${path} AND user_id = ${session.user_id}::uuid
    LIMIT 1
  `;

  if (!owned.length) {
    return tracedError("File not found or access denied", 404);
  }

  const attachment = owned[0] as { mime_type: string; filename: string };

  try {
    const storage = getStorageProvider();
    const { buffer } = await storage.getObjectAndMeta(path);

    if (!buffer) {
      return tracedError("Failed to fetch file from storage", 500);
    }

    const headers: Record<string, string> = {
      "Content-Type": attachment.mime_type || "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": inline
        ? `inline; filename="${attachment.filename}"`
        : `attachment; filename="${attachment.filename}"`,
      "Content-Length": buffer.byteLength.toString(),
    };

    return new NextResponse(buffer, {
      status: 200,
      headers,
    });
  } catch (error) {
    logger.error("s3 proxy fetch failed", { path, error });
    return tracedError("Failed to fetch file", 500);
  }
});
