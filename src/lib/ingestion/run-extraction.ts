import { replaceNoteEmbeddings } from "@/lib/rag/indexing";
import { stripMarkdown } from "@/lib/rag/strip-markdown";
import { extractContentFromBuffer } from "@/lib/ingestion/extraction-core";
import sql from "@/database/pgsql";
import { getStorageProvider } from "@/lib/storage/init";
import logger from "@/lib/logger";
import { enqueueExtractionRetry } from "@/lib/canvas/extraction-retry";
import { persistMarkerAssetsForNote } from "@/lib/marker/output";

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
  const [activeNote] = await sql`
    SELECT note_id
    FROM app.notes
    WHERE note_id = ${documentId}::uuid
      AND user_id = ${userId}::uuid
      AND deleted_at IS NULL
    LIMIT 1
  `;
  if (!activeNote) return { chunksStored: 0 };

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

  const extracted = await extractContentFromBuffer({
    buffer,
    filename,
    mimeType,
  });
  const { rawText, chunks, source, markerImages, markerMetadata, pageRange } =
    extracted;

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
  if (
    source === "marker" &&
    markerImages &&
    Object.keys(markerImages).length > 0
  ) {
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
  const extractionCoverage = JSON.stringify({
    source,
    page_range: pageRange ?? null,
    partial: Boolean(pageRange),
    extracted_at: new Date().toISOString(),
  });
  const updated = await sql`
        UPDATE app.notes
        SET content = ${finalMarkdown},
            extracted_text = ${cleanedText},
            extraction_coverage = ${extractionCoverage}::jsonb,
            updated_at = NOW()
        WHERE note_id = ${documentId}::uuid
          AND user_id = ${userId}::uuid
          AND deleted_at IS NULL
        RETURNING note_id
    `;
  if (updated.length === 0) return { chunksStored: 0 };

  if (chunks.length === 0) {
    logger.warn("extraction produced no chunks", { documentId, s3Key });
    return { chunksStored: 0 };
  }

  const chunksStored = await replaceNoteEmbeddings(documentId, userId, chunks);

  return { chunksStored };
}
