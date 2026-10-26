/**
 * Vault Import Worker
 * Streams a zip file from S3, creates folders + notes in the user's tree,
 * and runs the full RAG pipeline (OCR, chunking, embeddings) on supported file types.
 *
 * ZIP parsing and its resource limits live in ./zip-stream.
 */

import logger from "../logger";
import type postgres from "postgres";
import sql from "../../database/pgsql";
import { v4 as uuidv4 } from "uuid";
import { chunkText } from "../rag/chunking.ts";
import { replaceNoteEmbeddings } from "../rag/indexing.ts";
import { stripMarkdown } from "../rag/strip-markdown.ts";
import { getStorageProvider } from "../storage/init.ts";
import type { StoreProvider } from "../storage/base";
import { insertNoteWithTree } from "../notes/storage/create-note";
import { moveNoteToExtractionBundle } from "../notes/extraction-bundle";
import { extractWithMarker } from "../marker/ocr.ts";
import { markerQueueEnabled, submitMarkerJob } from "../marker/serverless.ts";
import {
  markerAssetPrefix,
  persistMarkerAssetsForNote,
} from "../marker/output.ts";
import {
  shouldIgnore,
  sanitizePath,
  ensureFolderPath,
  assertVaultImportJobActive,
  VaultImportCancelledError,
  VaultTreeParentUnavailableError,
} from "./tree-builder";
import { processVaultZipStream, VaultUserError } from "./zip-stream";
import {
  heartbeatVaultJob,
  markVaultJobCancelled,
  markVaultJobFailed,
} from "./jobs";
import { sendVaultImportCompleteEmail } from "../email";

export { processVaultZipStream } from "./zip-stream";

const PROCESSABLE_EXTS = new Set([
  "pdf",
  "docx",
  "doc",
  "pptx",
  "ppt",
  "md",
  "markdown",
  "txt",
]);

const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
  md: "text/markdown",
  markdown: "text/markdown",
  txt: "text/plain",
};

// quiz seeding only needs a sample, never every chunk of a large vault
const QUIZ_SEED_CHUNK_SAMPLE = 500;

function getMimeType(filename: string | null | undefined): string | null {
  const ext = filename?.toLowerCase().split(".").pop();
  return ext && EXT_MIME[ext] ? EXT_MIME[ext] : null;
}

function isProcessable(filename: string | null | undefined): boolean {
  const ext = filename?.toLowerCase().split(".").pop();
  return Boolean(ext && PROCESSABLE_EXTS.has(ext));
}

/**
 * Every archive entry gets its own object, even when the ZIP repeats a path.
 * Two notes sharing one key would let deleting either remove the other's
 * bytes. The job prefix stays first so Clear Vault can sweep the whole job.
 */
export function vaultSourceObjectKey(
  userId: string,
  jobId: string,
  filename: string,
): string {
  return `vault/${userId}/${jobId}/${uuidv4()}/${filename}`;
}

async function isActiveNote(userId: string, noteId: string): Promise<boolean> {
  const [note] = await sql`
    SELECT note_id
    FROM app.notes
    WHERE note_id = ${noteId}::uuid
      AND user_id = ${userId}::uuid
      AND deleted_at IS NULL
    LIMIT 1
  `;
  return Boolean(note);
}

/**
 * Always a new note. Reusing a same-titled note here would overwrite a note
 * the user already had (or another file from the same ZIP) with OCR output.
 */
async function createCompanionNote(
  userId: string,
  title: string,
  parentId: string | null,
  content: string,
  jobId: string,
): Promise<string> {
  const noteId = uuidv4();
  await sql.begin(async (tx: postgres.TransactionSql) => {
    await assertVaultImportJobActive(tx, userId, jobId);
    await insertNoteWithTree(tx, {
      noteId,
      userId,
      title,
      content,
      isFolder: false,
      parentId,
    });
  });
  return noteId;
}

interface PersistVaultSourceFileInput {
  storage: Pick<StoreProvider, "putObject" | "deleteObject">;
  userId: string;
  title: string;
  parentId: string | null;
  s3Key: string;
  content: string;
  mimeType: string;
  buffer: Buffer;
  jobId?: string;
}

/** Write bytes first, then atomically attach their note/tree ownership. */
export async function persistVaultSourceFile({
  storage,
  userId,
  title,
  parentId,
  s3Key,
  content,
  mimeType,
  buffer,
  jobId,
}: PersistVaultSourceFileInput): Promise<string> {
  await storage.putObject(s3Key, buffer, { contentType: mimeType });

  const noteId = uuidv4();
  try {
    await sql.begin(async (tx: postgres.TransactionSql) => {
      await assertVaultImportJobActive(tx, userId, jobId);
      await insertNoteWithTree(tx, {
        noteId,
        userId,
        title,
        content,
        isFolder: false,
        parentId,
        s3Key,
      });
      await tx`
        INSERT INTO app.attachments (
          id, note_id, user_id, filename, s3_key, mime_type, file_size
        ) VALUES (
          ${uuidv4()}::uuid,
          ${noteId}::uuid,
          ${userId}::uuid,
          ${title},
          ${s3Key},
          ${mimeType},
          ${buffer.length}
        )
      `;
    });
  } catch (relationalError) {
    try {
      await storage.deleteObject(s3Key);
    } catch (cleanupError) {
      throw new AggregateError(
        [relationalError, cleanupError],
        `Failed to persist ${s3Key} and remove its uploaded object`,
      );
    }
    throw relationalError;
  }

  // The source note is now durable even though OCR/embeddings may still be
  // running. Publish its branch only after the transaction succeeds so the
  // sidebar can show meaningful import progress without exposing rollbacks.
  return noteId;
}

export async function processRagPipeline(
  noteId: string,
  userId: string,
  parentFolderId: string | null,
  buffer: Buffer,
  opts: { filename: string; mimeType: string | null; jobId: string; s3Key?: string },
): Promise<void> {
  const { filename, mimeType } = opts;
  const isText = mimeType?.startsWith("text/");

  if (!isText && markerQueueEnabled()) {
    const sourceKey = opts.s3Key;
    if (!sourceKey) throw new Error("Vault extraction requires a stored source file");
    await sql.begin(async (tx: postgres.TransactionSql) => {
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${userId}::text, 0))`;
      await assertVaultImportJobActive(tx, userId, opts.jobId);
      const [source] = await tx`
        SELECT note_id FROM app.notes
        WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
          AND deleted_at IS NULL
        FOR SHARE
      `;
      if (!source) throw new VaultImportCancelledError();
      await tx`
        INSERT INTO app.ingestion_jobs (note_id, user_id, s3_key, mime_type, status)
        VALUES (${noteId}::uuid, ${userId}::uuid, ${sourceKey}, ${mimeType}, 'pending')
        ON CONFLICT DO NOTHING
      `;
    });
    try {
      // the ZIP job owns file creation; extraction continues as a durable note job
      await submitMarkerJob({
        sourceKey,
        sourceBytes: buffer.length,
        noteId,
        userId,
        filename,
        mimeType,
        parentFolderId,
      });
    } catch (error) {
      await sql`
        UPDATE app.ingestion_jobs
        SET status = 'failed', error = 'Could not queue document extraction', updated_at = NOW()
        WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
          AND status = 'pending'
      `;
      throw error;
    }
    return;
  }

  let rawText;
  let chunks;
  let markerImages: Record<string, string> = {};
  let markerMetadata = null;
  let pageRange: string | null = null;

  if (isText) {
    rawText = buffer.toString("utf-8");
    chunks = chunkText(rawText);
  } else {
    const marker = await extractWithMarker(buffer, filename ?? "document.pdf");
    rawText = marker.text;
    chunks = marker.chunks;
    markerImages = marker.images ?? {};
    markerMetadata = marker.metadata ?? null;
    pageRange = marker.pageRange;
  }

  // coverage record so page-limited marker runs stay visible on the note
  const extractionCoverage = JSON.stringify({
    source: isText ? "text" : "marker",
    page_range: pageRange,
    partial: Boolean(pageRange),
    extracted_at: new Date().toISOString(),
  });

  if (isText) {
    const searchText = stripMarkdown(rawText);
    await sql`
      UPDATE app.notes
      SET content = ${rawText}, extracted_text = ${searchText}, extraction_coverage = ${extractionCoverage}::text::jsonb, updated_at = NOW()
      WHERE note_id = ${noteId}::uuid
        AND user_id = ${userId}::uuid
        AND deleted_at IS NULL
    `;
    await replaceNoteEmbeddings(noteId, userId, chunks);
    logger.info("vault import text note indexed");
    return;
  }

  // Binary docs create an extracted .md companion; PDFs share a named bundle.
  const mdTitle = filename.replace(/\.[^.]+$/, "") + ".md";
  const markdownParentFolderId =
    mimeType === "application/pdf"
      ? await moveNoteToExtractionBundle(userId, noteId, filename)
      : parentFolderId;
  const mdNoteId = await createCompanionNote(
    userId,
    mdTitle,
    markdownParentFolderId,
    rawText,
    opts.jobId,
  );
  const storage = getStorageProvider();
  if (!(await isActiveNote(userId, mdNoteId))) return;
  const markerAssets = await persistMarkerAssetsForNote({
    storage,
    userId,
    noteId: mdNoteId,
    markdown: rawText,
    images: markerImages,
    metadata: markerMetadata,
  });
  if (!(await isActiveNote(userId, mdNoteId))) {
    // Clear Vault/Trash may win while Marker assets are being persisted. The
    // permanent cleanup may have run before these late writes, so remove this
    // known note namespace immediately instead of leaving untracked objects.
    await storage.deletePrefix(markerAssetPrefix(userId, mdNoteId)).catch(
      (cleanupError) => {
        logger.warn("vault import marker asset cleanup failed", { error: cleanupError });
      },
    );
    return;
  }
  const finalMarkdown = markerAssets.markdown;
  const searchText = stripMarkdown(finalMarkdown);
  await sql`
    UPDATE app.notes
    SET content = ${finalMarkdown}, extracted_text = ${searchText}, extraction_coverage = ${extractionCoverage}::text::jsonb, updated_at = NOW()
    WHERE note_id = ${mdNoteId}::uuid
      AND user_id = ${userId}::uuid
      AND deleted_at IS NULL
  `;
  await replaceNoteEmbeddings(mdNoteId, userId, chunks);
  logger.info("vault import markdown note indexed");
}

interface VaultImportMessage {
  jobId: string;
  userId: string;
  s3Key: string;
}

function requireVaultImportMessage(msg: Record<string, unknown>): VaultImportMessage {
  const { jobId, userId, s3Key } = msg;
  if (
    typeof jobId !== "string" ||
    typeof userId !== "string" ||
    typeof s3Key !== "string"
  ) {
    throw new Error("Invalid vault import message");
  }
  return { jobId, userId, s3Key };
}

async function streamAndProcessZip(
  s3Key: string,
  processEntry: (entryPath: string, buffer: Buffer) => Promise<void>,
  isCancelled: () => boolean,
): Promise<number> {
  const { body: readable } = await getStorageProvider().getObjectStream(s3Key);
  try {
    return await processVaultZipStream(readable, processEntry, {}, isCancelled);
  } finally {
    readable.destroy();
  }
}

async function seedQuizFromImport(userId: string, jobId: string): Promise<void> {
  const chunks = await sql<Array<{ id: string }>>`
    SELECT c.id FROM app.chunks c
    WHERE c.user_id = ${userId}::uuid
      AND c.created_at >= (
        SELECT started_at FROM app.canvas_import_jobs
        WHERE id = ${jobId}::uuid AND user_id = ${userId}::uuid
      )
    ORDER BY c.created_at DESC
    LIMIT ${QUIZ_SEED_CHUNK_SAMPLE}
  `;
  const chunkIds = chunks.map((row) => row.id);
  if (chunkIds.length === 0) return;
  const { seedQuestionsAfterImport } = await import("../quiz/generate-background.ts");
  await seedQuestionsAfterImport(userId, chunkIds, 5);
  logger.info("vault import quiz seed completed");
}

/**
 * Main entry point — called from worker-entry.js
 */
export async function processVaultImport(msg: Record<string, unknown>): Promise<void> {
  const { jobId, userId, s3Key } = requireVaultImportMessage(msg);
  logger.info("vault import started");
  let cancelled = false;

  try {
    // Claim exactly once. In particular, a stale delivery must never change a
    // Clear Vault-cancelled job back to processing and resume writing notes.
    const [claimed] = await sql`
      UPDATE app.canvas_import_jobs
      SET status = 'processing', started_at = COALESCE(started_at, NOW()), updated_at = NOW()
      WHERE id = ${jobId}::uuid
        AND user_id = ${userId}::uuid
        AND type = 'vault-import'
        AND input_s3_key = ${s3Key}
        AND status = 'queued'
        AND cancel_requested_at IS NULL
      RETURNING id
    `;
    if (!claimed) {
      logger.info("vault import skipped: claimed, cancelled or missing");
      return;
    }

    const storage = getStorageProvider();
    const folderCache = new Map<string, string>();
    let totalFiles = 0;
    let failedFiles = 0;

    const stopIfNoLongerActive = async () => {
      const state = await heartbeatVaultJob(jobId, userId, totalFiles);
      if (state === "active" || cancelled) return;
      cancelled = true;
      if (state === "cancel-requested") {
        await markVaultJobCancelled(jobId, totalFiles);
      }
      logger.info("vault import stopped");
    };

    logger.info("vault import streaming archive");

    const totalEntries = await streamAndProcessZip(
      s3Key,
      async (entryPath, buffer) => {
        if (cancelled) return;
        const cleanPath = sanitizePath(entryPath);
        if (!cleanPath || shouldIgnore(cleanPath)) return;

        const filename = cleanPath.split("/").pop();
        if (!filename) return;

        let uploadedFileKey: string | null = null;
        try {
          const parentId = await ensureFolderPath(
            userId,
            cleanPath,
            folderCache,
            jobId,
          );

          const mimeType = getMimeType(filename);
          const s3FileKey = vaultSourceObjectKey(userId, jobId, filename);
          uploadedFileKey = s3FileKey;

          const noteId = await persistVaultSourceFile({
            storage,
            userId,
            title: filename,
            parentId,
            s3Key: s3FileKey,
            content: mimeType?.startsWith("text/")
              ? buffer.toString("utf-8")
              : "",
            mimeType: mimeType || "application/octet-stream",
            buffer,
            jobId,
          });

          if (isProcessable(filename)) {
            try {
              await processRagPipeline(noteId, userId, parentId, buffer, {
                filename,
                mimeType,
                jobId,
                s3Key: s3FileKey,
              });
            } catch (ragErr) {
              logger.error("vault import indexing failed", { error: ragErr });
            }
          }

          totalFiles++;
          logger.info("vault import file imported");
        } catch (err) {
          if (
            err instanceof VaultImportCancelledError ||
            err instanceof VaultTreeParentUnavailableError
          ) {
            // A cooperative cancellation can win after the bytes have been
            // uploaded but before a note owns them. Remove that otherwise
            // unreferenced object immediately; a future Clear Vault has no
            // note row from which to discover it.
            if (uploadedFileKey) {
              await storage.deleteObject(uploadedFileKey).catch((cleanupError) => {
                logger.warn("vault import cancelled object cleanup failed", { error: cleanupError });
              });
            }
            if (err instanceof VaultImportCancelledError) {
              cancelled = true;
            }
            return;
          }
          failedFiles++;
          logger.error("vault import file failed", { error: err });
        }
        // the heartbeat doubles as the cancel poll, so small imports stay cancellable
        await stopIfNoLongerActive();
      },
      () => cancelled,
    );

    if (cancelled) {
      logger.info("vault import cancelled: skipping completion");
      return;
    }

    // A vault archive is a backup/import contract. Keep successfully created
    // notes, but never report a partial import as complete. Vault jobs are
    // deliberately single-attempt until import replay is idempotent.
    if (failedFiles > 0) {
      throw new VaultUserError(
        `Could not import ${failedFiles} file${failedFiles === 1 ? "" : "s"}. Files processed before the error remain in your vault.`,
      );
    }

    try {
      await seedQuizFromImport(userId, jobId);
    } catch (seedErr) {
      logger.warn("vault import quiz seed failed", { error: seedErr });
    }

    const completed = await sql`
      UPDATE app.canvas_import_jobs
      SET status = 'complete', processed_files = ${totalFiles}, expected_total = ${totalEntries}, completed_at = NOW(), updated_at = NOW()
      WHERE id = ${jobId}::uuid AND status = 'processing'
      RETURNING id
    `;
    if (completed.length === 0) {
      logger.info("vault import finished after terminal state: skipping email");
      return;
    }

    try {
      const [user] =
        await sql`SELECT email FROM app.login WHERE user_id = ${userId}::uuid`;
      if (user?.email) {
        await sendVaultImportCompleteEmail(user.email, {
          totalFiles,
          totalFolders: folderCache.size,
          failedFiles,
        });
      }
    } catch (emailErr) {
      logger.error("vault import email notification failed", { error: emailErr });
    }

    logger.info("vault import completed");
  } catch (error) {
    if (cancelled) {
      logger.warn("vault import error ignored after cancel", { error });
      return;
    }
    logger.error("vault import failed", { error });
    // only archive problems the user can act on are shown verbatim; internal
    // errors can carry hostnames or SQL details
    await markVaultJobFailed(
      jobId,
      error instanceof VaultUserError
        ? error.message
        : "Import failed. Please try again.",
    );
    throw error;
  }
}
