/**
 * Canvas Import — Embedding Phase
 *
 * Chunks extracted text and sends it through the embedding pipeline.
 * Houses the full RAG pipeline: content extraction (OCR/text parse)
 * followed by embedding storage.
 */

import sql from "../../database/pgsql.js";
import { stripMarkdown } from "../strip-markdown.ts";
import { getStorageProvider } from "../storage/init.ts";
import { replaceNoteEmbeddings } from "../rag/indexing.ts";
import {
  enqueueExtractionRetry,
  MAX_EXTRACTION_RETRIES,
} from "./extraction-retry.ts";
import { extractContentFromBuffer } from "../ingestion/extraction-core.ts";
import { persistMarkerAssetsForNote } from "../marker-output.ts";
import { createAsyncLimiter } from "./async-limiter.js";
import { parseEnvConcurrency } from "./import-metrics.js";
import logger from "../logger.ts";

// ── Concurrency limiters ────────────────────────────────────────────────────

const CANVAS_OCR_CONCURRENCY = parseEnvConcurrency(
  "CANVAS_OCR_CONCURRENCY",
  2,
);
const CANVAS_EMBED_CONCURRENCY = parseEnvConcurrency(
  "CANVAS_EMBED_CONCURRENCY",
  3,
);

const ocrLimiter = createAsyncLimiter(CANVAS_OCR_CONCURRENCY);
const embedLimiter = createAsyncLimiter(CANVAS_EMBED_CONCURRENCY);

// ── Helpers ─────────────────────────────────────────────────────────────────

async function replaceEmbeddings(targetNoteId, userId, chunks) {
  return embedLimiter(() =>
    replaceNoteEmbeddings(targetNoteId, userId, chunks),
  );
}

async function queueExtractionRetry(retryOpts) {
  const { delaySeconds, queueUrl, usedFallbackQueue } =
    await enqueueExtractionRetry(retryOpts);

  console.log(
    `Queuing extraction retry for note ${retryOpts.noteId} (attempt ${retryOpts.attempt + 1}, delay ${delaySeconds}s)` +
      (usedFallbackQueue ? " via main queue fallback" : ""),
  );

  if (usedFallbackQueue) {
    console.warn(
      `SQS_EXTRACT_RETRY_QUEUE_URL not set, using fallback queue: ${queueUrl}`,
    );
  }
}

// ── RAG pipeline (extraction + embedding) ───────────────────────────────────

/**
 * runs the full RAG pipeline for a single file buffer:
 * 1. extracts text content (OCR or text parse)
 * 2. creates/updates notes with extracted content
 * 3. generates and stores embeddings
 *
 * @param {string} noteId
 * @param {string} userId
 * @param {string|null} parentFolderId
 * @param {Buffer} buffer
 * @param {object} ragOpts
 * @param {Function} findOrCreateNote - injected to avoid circular deps
 * @returns {Promise<{noteId: string, chunksStored: number}|null>}
 */
export async function processRagPipeline(
  noteId,
  userId,
  parentFolderId,
  buffer,
  ragOpts,
  findOrCreateNote,
) {
  const {
    filename,
    mimeType,
    s3Key = null,
    attempt = 0,
    jobId,
    canvasCourseId = null,
    canvasModuleId = null,
    canvasAssignmentId = null,
  } = ragOpts;
  try {
    const extractionStart = Date.now();
    const extraction = await ocrLimiter(() =>
      extractContentFromBuffer({
        buffer,
        filename: filename ?? "document.pdf",
        mimeType,
      }),
    );
    const extractionElapsedMs = Date.now() - extractionStart;

    const {
      rawText,
      chunks,
      source,
      markerImages = {},
      markerMetadata = null,
    } = extraction;
    const isText = source === "text";

    logger.info("canvas-import-file-extracted", {
      jobId,
      filename,
      source,
      chunkCount: chunks.length,
      elapsedMs: extractionElapsedMs,
      elapsedSecs: (extractionElapsedMs / 1000).toFixed(2),
    });

    if (source === "text") {
      console.log(
        `Text extract (${mimeType}): ${chunks.length} chunks for note ${noteId}`,
      );
    } else if (source === "marker") {
      console.log(
        `Marker: extracted ${chunks.length} chunks for note ${noteId}`,
      );
    } else {
      console.log(
        `pdf-parse fallback: extracted ${chunks.length} chunks for note ${noteId}`,
      );
      // skip retry when Marker is intentionally off — nothing to retry to
      if (attempt < MAX_EXTRACTION_RETRIES && process.env.CANVAS_SKIP_MARKER !== "true") {
        await queueExtractionRetry({
          noteId,
          userId,
          s3Key,
          filename,
          mimeType,
          parentFolderId,
          attempt,
        });
        console.log(
          `Queued Marker enrichment retry for note ${noteId} after pdf-parse fallback`,
        );
      }
    }

    if (isText) {
      const searchText = stripMarkdown(rawText);
      // text files: embed on the original note directly (no sibling needed)
      await sql`
        UPDATE app.notes
        SET extracted_text = ${searchText}, updated_at = NOW()
        WHERE note_id = ${noteId}::uuid
      `;
      const embeddingStart = Date.now();
      const count = await replaceEmbeddings(noteId, userId, chunks);
      const embeddingElapsedMs = Date.now() - embeddingStart;

      logger.info("canvas-import-file-embedded", {
        jobId,
        filename,
        chunkCount: count,
        elapsedMs: embeddingElapsedMs,
        elapsedSecs: (embeddingElapsedMs / 1000).toFixed(2),
      });

      console.log(`RAG: ${count} chunks embedded on text note ${noteId}`);
      return { noteId, chunksStored: count };
    }

    // binary files: create a sibling .md note for the extracted content
    const mdTitle = filename.replace(/\.[^.]+$/, "") + ".md";
    const { noteId: mdNoteId } = await findOrCreateNote(
      userId,
      mdTitle,
      parentFolderId,
      { content: rawText, canvasCourseId, canvasModuleId, canvasAssignmentId },
    );
    const storage = getStorageProvider();
    const markerAssets = await persistMarkerAssetsForNote({
      storage,
      userId,
      noteId: mdNoteId,
      markdown: rawText,
      images: markerImages,
      metadata: markerMetadata,
    });
    const finalMarkdown = markerAssets.markdown;
    const searchText = stripMarkdown(finalMarkdown);

    // stripped text for full-text search (no ### --- ** etc.)
    await sql`
      UPDATE app.notes
      SET content = ${finalMarkdown}, extracted_text = ${searchText}, updated_at = NOW()
      WHERE note_id = ${mdNoteId}::uuid
    `;

    const embeddingStart = Date.now();
    const count = await replaceEmbeddings(mdNoteId, userId, chunks);
    const embeddingElapsedMs = Date.now() - embeddingStart;

    logger.info("canvas-import-file-embedded", {
      jobId,
      filename,
      chunkCount: count,
      elapsedMs: embeddingElapsedMs,
      elapsedSecs: (embeddingElapsedMs / 1000).toFixed(2),
    });

    if (attempt > 0) {
      await sql`
        UPDATE app.canvas_imports
        SET status = 'complete', error_message = NULL, updated_at = NOW()
        WHERE note_id = ${noteId}::uuid AND status = 'pending_retry'
      `;
    }

    console.log(
      `RAG: ${count} chunks embedded on MD note ${mdNoteId} (source: ${noteId}, marker images: ${markerAssets.imageCount})`,
    );
    return { noteId: mdNoteId, chunksStored: count };
  } catch (error) {
    if (attempt < MAX_EXTRACTION_RETRIES) {
      await queueExtractionRetry({
        noteId,
        userId,
        s3Key,
        filename,
        mimeType,
        parentFolderId,
        attempt,
      });
      await sql`
        UPDATE app.canvas_imports
        SET status = 'pending_retry', error_message = ${error.message}, updated_at = NOW()
        WHERE note_id = ${noteId}::uuid
      `;
      console.log(
        `Extraction failed for note ${noteId}, queued for retry (attempt ${attempt + 1})`,
      );
      return null;
    }
    console.error(`RAG pipeline error for note ${noteId}:`, error);
    throw error;
  }
}
