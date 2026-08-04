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
import { sanitizePostgresText } from "../text-sanitize.ts";
import {
  markerQueueEnabled,
  MarkerSubmissionCancelledError,
  processAllPdfsWithMarker,
  submitMarkerJob,
} from "../marker-serverless.ts";

// ── Concurrency limiters ────────────────────────────────────────────────────

const CANVAS_OCR_CONCURRENCY = parseEnvConcurrency("CANVAS_OCR_CONCURRENCY", 2);
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
  const { delaySeconds } = await enqueueExtractionRetry(retryOpts);
  console.log(
    `Queuing extraction retry for note ${retryOpts.noteId} (attempt ${retryOpts.attempt + 1}, delay ${delaySeconds}s)`,
  );
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
    importRecordId = null,
    canvasCourseId = null,
    canvasModuleId = null,
    canvasAssignmentId = null,
    extractionOverride = null,
    retryOnFailure = true,
  } = ragOpts;
  try {
    const canQueueMarker = markerQueueEnabled() && Boolean(s3Key);
    const queueMarker = async () => {
      const submitted = await submitMarkerJob({
        sourceKey: s3Key,
        sourceBytes: buffer?.length ?? null,
        noteId,
        userId,
        jobId,
        filename: filename ?? "document.pdf",
        mimeType,
        parentFolderId,
      });
      // submitMarkerJob atomically persists the Marker row and pending states
      // before it publishes work. Repeating those updates here could overwrite
      // a fast completion with pending_marker.
      logger.info("marker-serverless-submitted", {
        jobId,
        markerJobId: submitted.markerJobId,
        provider: submitted.provider,
        noteId,
        filename,
      });
      return { noteId, chunksStored: 0, pendingMarker: true };
    };

    if (
      canQueueMarker &&
      mimeType === "application/pdf" &&
      processAllPdfsWithMarker()
    ) {
      return await queueMarker();
    }

    const extractionStart = Date.now();
    const extraction =
      extractionOverride ??
      (await ocrLimiter(() =>
        extractContentFromBuffer({
          buffer,
          filename: filename ?? "document.pdf",
          mimeType,
        }),
      ));
    const extractionElapsedMs = Date.now() - extractionStart;

    const {
      rawText: extractedRawText,
      chunks: extractedChunks,
      source,
      markerImages = {},
      markerMetadata = null,
      pageRange = null,
    } = extraction;
    if (source === "skipped" && canQueueMarker) {
      return await queueMarker();
    }
    // coverage record so page-limited marker runs are never mistaken for
    // full-document extraction (partial notes can be found and re-enriched)
    const extractionCoverage = JSON.stringify({
      source,
      page_range: pageRange,
      partial: Boolean(pageRange),
      extracted_at: new Date().toISOString(),
    });
    const rawText = sanitizePostgresText(extractedRawText ?? "");
    const chunks = (extractedChunks ?? []).map((chunk) =>
      sanitizePostgresText(chunk),
    );
    const isText = source === "text";

    // skipped: non-PDF binary with no Marker and no text fallback — stored as attachment only
    if (source === "skipped") {
      return { noteId, chunksStored: 0 };
    }

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
        `pdf-parse: extracted ${chunks.length} chunks for note ${noteId}`,
      );
    }

    if (isText) {
      const searchText = stripMarkdown(rawText);
      // text files: embed on the original note directly (no sibling needed)
      await sql`
        UPDATE app.notes
        SET extracted_text = ${searchText}, extraction_coverage = ${extractionCoverage}::jsonb, updated_at = NOW()
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
      SET content = ${finalMarkdown}, extracted_text = ${searchText}, extraction_coverage = ${extractionCoverage}::jsonb, updated_at = NOW()
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

    console.log(
      `RAG: ${count} chunks embedded on MD note ${mdNoteId} (source: ${noteId}, marker images: ${markerAssets.imageCount})`,
    );
    return { noteId: mdNoteId, chunksStored: count };
  } catch (error) {
    if (error instanceof MarkerSubmissionCancelledError) {
      // Cancellation won the durable submission fence. Do not turn that into
      // a generic extraction retry, which could revive the cancelled import.
      console.log(`Marker submission skipped for inactive import ${noteId}`);
      return null;
    }
    if (retryOnFailure && attempt < MAX_EXTRACTION_RETRIES) {
      const message = error instanceof Error ? error.message : String(error);
      // Persist the retry intent before publishing its message. A fast queue
      // consumer must observe `pending_retry`, and a cancelled/replaced Canvas
      // generation must not be revived by an enqueue that won the race.
      const stagedImports = await sql`
        UPDATE app.canvas_imports
        SET status = 'pending_retry', error_message = ${message}, updated_at = NOW()
        WHERE note_id = ${noteId}::uuid
          AND user_id = ${userId}::uuid
          AND (${jobId ?? null}::uuid IS NULL OR job_id = ${jobId}::uuid)
          AND (${importRecordId ?? null}::uuid IS NULL OR id = ${importRecordId ?? null}::uuid)
          AND status IN ('downloading', 'processing', 'indexing', 'pending_retry')
        RETURNING id
      `;
      const stagedIngestion = await sql`
        UPDATE app.ingestion_jobs
        SET status = 'pending', error = ${message}, updated_at = NOW()
        WHERE note_id = ${noteId}::uuid
          AND user_id = ${userId}::uuid
          AND status NOT IN ('done', 'cancelled')
        RETURNING id
      `;
      if (jobId && stagedImports.length === 0) {
        console.log(`Extraction retry skipped for inactive Canvas import ${noteId}`);
        return null;
      }
      if (!jobId && stagedImports.length === 0 && stagedIngestion.length === 0) {
        console.log(`Extraction retry skipped for inactive note ${noteId}`);
        return null;
      }
      try {
        await queueExtractionRetry({
          noteId,
          userId,
          s3Key,
          filename,
          mimeType,
          parentFolderId,
          attempt,
          importRecordId,
          jobId,
        });
      } catch (enqueueError) {
        const enqueueMessage =
          enqueueError instanceof Error ? enqueueError.message : String(enqueueError);
        await sql`
          UPDATE app.canvas_imports
          SET status = 'error', error_message = ${enqueueMessage}, updated_at = NOW()
          WHERE note_id = ${noteId}::uuid
            AND user_id = ${userId}::uuid
            AND (${jobId ?? null}::uuid IS NULL OR job_id = ${jobId}::uuid)
            AND (${importRecordId ?? null}::uuid IS NULL OR id = ${importRecordId ?? null}::uuid)
            AND status = 'pending_retry'
        `;
        await sql`
          UPDATE app.ingestion_jobs
          SET status = 'failed', error = ${enqueueMessage}, updated_at = NOW()
          WHERE note_id = ${noteId}::uuid
            AND user_id = ${userId}::uuid
            AND status = 'pending'
        `;
        throw enqueueError;
      }
      console.log(
        `Extraction failed for note ${noteId}, queued for retry (attempt ${attempt + 1})`,
      );
      return null;
    }
    console.error(`RAG pipeline error for note ${noteId}:`, error);
    throw error;
  }
}
