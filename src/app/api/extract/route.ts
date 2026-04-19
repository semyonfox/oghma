// extract API route — document ingestion pipeline
// The core logic is exported as runExtraction() so the worker can call it directly
// The HTTP POST handler remains for manual/admin triggers only
import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { replaceNoteEmbeddings } from "@/lib/rag/indexing";
import { stripMarkdown } from "@/lib/strip-markdown";
import { extractContentFromBuffer } from "@/lib/ingestion/extraction-core";
import sql from "@/database/pgsql.js";
import { withErrorHandler } from "@/lib/api-error";
import { ApiError } from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rateLimiter";
import { xraySubsegment } from "@/lib/xray";
import { getStorageProvider } from "@/lib/storage/init";
import logger from "@/lib/logger";
import { enqueueExtractionRetry } from "@/lib/canvas/extraction-retry";
import { persistMarkerAssetsForNote } from "@/lib/marker-output";

function isAllowedUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const h = parsed.hostname.toLowerCase();
  if (h === "169.254.169.254" || h === "metadata.google.internal") return false;
  return !/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|localhost|::1|\[::1\])/.test(
    h,
  );
}

export interface ExtractionResult {
  chunksStored: number;
}

/**
 * Core extraction logic — called by the ingestion worker.
 * Fetches the file from S3, extracts text, chunks, embeds, and stores.
 */
export async function runExtraction(
  documentId: string,
  userId: string,
  s3Key: string,
  mimeType: string,
): Promise<ExtractionResult> {
  const storage = getStorageProvider();

  // get a fresh signed URL (worker may have picked up the job after the
  // original upload URL has expired)
  const url = await storage.getSignUrl(s3Key, 1800);

  // fetch the file — no hard timeout here, the worker controls its own lifecycle
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch file from S3: ${response.status}`);
  }

  const contentLength = parseInt(
    response.headers.get("content-length") ?? "0",
    10,
  );
  if (contentLength > 50 * 1024 * 1024) {
    throw new Error("File too large (max 50MB)");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 50 * 1024 * 1024) {
    throw new Error("File too large (max 50MB)");
  }

  const filename = s3Key.split("/").pop() ?? "document.pdf";

  const extracted = await xraySubsegment("document-extract", () =>
    extractContentFromBuffer({
      buffer,
      filename,
      mimeType,
    }),
  );
  const { rawText, chunks, source, markerImages, markerMetadata } = extracted;

  if (source === "pdf-parse") {
    logger.warn("Marker unavailable, using pdf-parse fallback", {
      documentId,
      filename,
    });
    // Queue Marker retry so richer OCR/diagram context can replace embeddings later.
    enqueueExtractionRetry({
      noteId: documentId,
      userId,
      s3Key,
      filename,
      mimeType: mimeType ?? "application/pdf",
      parentFolderId: null,
      attempt: 0,
    }).catch((retryErr) => {
      logger.warn("Failed to enqueue Marker retry (non-fatal)", {
        retryErr,
      });
    });
  }

  // persist Marker images to S3 and rewrite image paths in the markdown
  let finalMarkdown = rawText;
  if (source === "marker" && markerImages && Object.keys(markerImages).length > 0) {
    try {
      const storage = getStorageProvider();
      const markerAssets = await persistMarkerAssetsForNote({
        storage,
        userId,
        noteId: documentId,
        markdown: rawText,
        images: markerImages,
        metadata: markerMetadata ?? null,
      });
      finalMarkdown = markerAssets.markdown;
      logger.info("marker assets persisted", {
        documentId,
        imageCount: markerAssets.imageCount,
      });
    } catch (assetErr) {
      logger.warn("failed to persist marker assets (non-fatal)", {
        documentId,
        error: assetErr,
      });
    }
  }

  const cleanedText = stripMarkdown(finalMarkdown);
  await sql`
        UPDATE app.notes
        SET content = ${finalMarkdown}, extracted_text = ${cleanedText}, updated_at = NOW()
        WHERE note_id = ${documentId}::uuid AND user_id = ${userId}::uuid
    `;

  if (chunks.length === 0) {
    logger.warn("extraction produced no chunks", { documentId, s3Key });
    return { chunksStored: 0 };
  }

  const chunksStored = await xraySubsegment("replace-embeddings", () =>
    replaceNoteEmbeddings(documentId, userId, chunks),
  );

  return { chunksStored };
}

// HTTP handler — kept for manual/admin use, not called by normal upload flow
export const POST = withErrorHandler(async (request: NextRequest) => {
  const session = await validateSession();
  if (!session) throw new ApiError(401, "Unauthorized");

  const userId = session.user_id;
  const limited = await checkRateLimit("extract", userId);
  if (limited) return limited;

  const { url, documentId } = await request.json();
  if (!url || !documentId)
    throw new ApiError(400, "url and documentId are required");
  if (!isAllowedUrl(url)) throw new ApiError(400, "Invalid or disallowed URL");

  // verify documentId belongs to the authenticated user before extraction
  const [ownedNote] = await sql`
    SELECT 1 FROM app.notes
    WHERE note_id = ${documentId}::uuid AND user_id = ${userId}::uuid
    LIMIT 1
  `;
  if (!ownedNote) throw new ApiError(404, "Note not found");

  const s3Key = new URL(url).pathname.replace(/^\//, "");
  const mimeType = "application/pdf";

  const result = await runExtraction(documentId, userId, s3Key, mimeType);
  return NextResponse.json({ success: true, ...result });
});
