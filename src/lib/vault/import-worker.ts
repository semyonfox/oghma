/**
 * Vault Import Worker
 * Streams a zip file from S3, creates folders + notes in the user's tree,
 * and runs the full RAG pipeline (OCR, chunking, embeddings) on supported file types.
 *
 * ZIP entries are spooled to temporary files before bounded processing.
 */

import logger from "../logger";
import type postgres from "postgres";
import sql from "../../database/pgsql";
import { v4 as uuidv4 } from "uuid";
import { Readable } from "stream";
import { UnzipInflate, Unzip } from "fflate";
import { closeSync, mkdtempSync, openSync, writeSync } from "node:fs";
import { readFile, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chunkText } from "../rag/chunking.ts";
import { replaceNoteEmbeddings } from "../rag/indexing.ts";
import { stripMarkdown } from "../rag/strip-markdown.ts";
import { getStorageProvider } from "../storage/init.ts";
import type { StoreProvider } from "../storage/base";
import { createS3ClientFromEnv } from "../storage/s3.ts";
import { insertNoteWithTree } from "../notes/storage/create-note";
import { moveNoteToExtractionBundle } from "../notes/extraction-bundle";
import { invalidateTreeAfterPublish } from "../notes/tree-cache";
import { extractWithMarker } from "../marker/ocr.ts";
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
import { sendVaultImportCompleteEmail } from "../email";

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

const FILE_CONCURRENCY = 5;
const MAX_DECOMPRESSED_SIZE = 20 * 1024 * 1024 * 1024; // 20GB
const MAX_ENTRIES = 50_000;
const MAX_ENTRY_BYTES = 250 * 1024 * 1024;
const MAX_STAGED_BYTES = 512 * 1024 * 1024;
const ZIP_INPUT_SLICE_BYTES = 4 * 1024;
const MAX_PENDING_ENTRIES = 512;

function getMimeType(filename: string | null | undefined): string | null {
  const ext = filename?.toLowerCase().split(".").pop();
  return ext && EXT_MIME[ext] ? EXT_MIME[ext] : null;
}

function isProcessable(filename: string | null | undefined): boolean {
  const ext = filename?.toLowerCase().split(".").pop();
  return Boolean(ext && PROCESSABLE_EXTS.has(ext));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

async function createNote(
  userId: string,
  title: string,
  parentId: string | null,
  opts: { s3Key?: string | null; content?: string } = {},
  jobId?: string,
): Promise<string> {
  const noteId = uuidv4();
  const s3Key = opts.s3Key ?? null;
  const content = opts.content ?? "";
  await sql.begin(async (tx: postgres.TransactionSql) => {
    // Coordinate with both Trash and Clear Vault. If Clear Vault wins, the
    // job check fails while holding the same user-tree lock and no late note
    // or tree row can be committed after its note snapshot was collected.
    await tx`
      SELECT pg_advisory_xact_lock(hashtextextended(${userId}::text, 0))
    `;
    await assertVaultImportJobActive(tx, userId, jobId);
    if (parentId) {
      const [parent] = await tx`
        SELECT note_id
        FROM app.notes
        WHERE note_id = ${parentId}::uuid
          AND user_id = ${userId}::uuid
          AND is_folder = TRUE
          AND deleted_at IS NULL
        FOR KEY SHARE
      `;
      if (!parent) throw new VaultTreeParentUnavailableError();
    }
    await tx`
      INSERT INTO app.notes (note_id, user_id, title, content, s3_key, is_folder, created_at, updated_at)
      VALUES (${noteId}::uuid, ${userId}::uuid, ${title}, ${content}, ${s3Key}, false, NOW(), NOW())
    `;
    await tx`
      INSERT INTO app.tree_items (user_id, note_id, parent_id)
      VALUES (${userId}::uuid, ${noteId}::uuid, ${parentId}::uuid)
      ON CONFLICT (user_id, note_id) DO NOTHING
    `;
  });
  await invalidateTreeAfterPublish(userId, parentId);
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
  await invalidateTreeAfterPublish(userId, parentId);
  return noteId;
}

async function findOrCreateNote(
  userId: string,
  title: string,
  parentId: string | null,
  opts: { s3Key?: string | null; content?: string } = {},
  jobId?: string,
): Promise<{ noteId: string; created: boolean }> {
  const existing = await sql`
    SELECT n.note_id FROM app.notes n
    JOIN app.tree_items t ON t.note_id = n.note_id AND t.user_id = n.user_id
    WHERE n.user_id = ${userId}::uuid
      AND n.title = ${title}
      AND n.is_folder = false
      AND n.deleted_at IS NULL
      AND ${parentId ? sql`t.parent_id = ${parentId}::uuid` : sql`t.parent_id IS NULL`}
    LIMIT 1
  `;
  if (existing.length > 0) {
    return { noteId: existing[0].note_id, created: false };
  }

  const noteId = await createNote(userId, title, parentId, opts, jobId);
  return { noteId, created: true };
}

async function processRagPipeline(
  noteId: string,
  userId: string,
  parentFolderId: string | null,
  buffer: Buffer,
  opts: { filename: string; mimeType: string | null; jobId?: string },
): Promise<void> {
  const { filename, mimeType } = opts;
  const isText = mimeType?.startsWith("text/");

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
      SET content = ${rawText}, extracted_text = ${searchText}, extraction_coverage = ${extractionCoverage}::jsonb, updated_at = NOW()
      WHERE note_id = ${noteId}::uuid
        AND user_id = ${userId}::uuid
        AND deleted_at IS NULL
    `;
    const count = await replaceNoteEmbeddings(noteId, userId, chunks);
    logger.info(`[vault-import] RAG: ${count} chunks for text note ${noteId}`);
    return;
  }

  // Binary docs create an extracted .md companion; PDFs share a named bundle.
  const mdTitle = filename.replace(/\.[^.]+$/, "") + ".md";
  const markdownParentFolderId =
    mimeType === "application/pdf"
      ? await moveNoteToExtractionBundle(userId, noteId, filename)
      : parentFolderId;
  const { noteId: mdNoteId } = await findOrCreateNote(
    userId,
    mdTitle,
    markdownParentFolderId,
    {
      content: rawText,
    },
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
        logger.warn(
          `[vault-import] failed to clean Marker assets for deleted note ${mdNoteId}:`,
          errorMessage(cleanupError),
        );
      },
    );
    return;
  }
  const finalMarkdown = markerAssets.markdown;
  const searchText = stripMarkdown(finalMarkdown);
  await sql`
    UPDATE app.notes
    SET content = ${finalMarkdown}, extracted_text = ${searchText}, extraction_coverage = ${extractionCoverage}::jsonb, updated_at = NOW()
    WHERE note_id = ${mdNoteId}::uuid
      AND user_id = ${userId}::uuid
      AND deleted_at IS NULL
  `;
  const count = await replaceNoteEmbeddings(mdNoteId, userId, chunks);
  logger.info(
    `[vault-import] RAG: ${count} chunks for MD note ${mdNoteId} (source: ${noteId}, marker images: ${markerAssets.imageCount})`,
  );
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

interface VaultZipLimits {
  maxEntryBytes: number;
  maxStagedBytes: number;
  maxDecompressedBytes: number;
  maxEntries: number;
  maxPendingEntries: number;
}

const VAULT_ZIP_LIMITS: VaultZipLimits = {
  maxEntryBytes: MAX_ENTRY_BYTES,
  maxStagedBytes: MAX_STAGED_BYTES,
  maxDecompressedBytes: MAX_DECOMPRESSED_SIZE,
  maxEntries: MAX_ENTRIES,
  maxPendingEntries: MAX_PENDING_ENTRIES,
};

/** Process ZIP bytes without retaining an archive or completed-file backlog. */
export async function processVaultZipStream(
  source: AsyncIterable<Uint8Array>,
  processEntry: (entryPath: string, buffer: Buffer) => Promise<void>,
  requestedLimits: Partial<VaultZipLimits> = {},
  isCancelled: () => boolean = () => false,
): Promise<number> {
  const limits = { ...VAULT_ZIP_LIMITS, ...requestedLimits };
  // callers may tighten these bounds, never loosen them
  for (const key of Object.keys(VAULT_ZIP_LIMITS) as Array<keyof VaultZipLimits>) {
    if (
      !Number.isSafeInteger(limits[key]) ||
      limits[key] <= 0 ||
      limits[key] > VAULT_ZIP_LIMITS[key]
    ) {
      throw new Error(`Invalid ZIP limit: ${key}`);
    }
  }
  const directory = mkdtempSync(join(tmpdir(), "oghma-vault-import-"));
  const openFiles = new Set<number>();
  const pending: Array<{ name: string; path: string; size: number }> = [];
  let entryCount = 0;
  let archiveEntryCount = 0;
  let totalSize = 0;
  let stagedBytes = 0;
  let unfinishedEntries = 0;
  let failure: Error | null = null;
  let header = Buffer.alloc(0);
  let zipSignatureChecked = false;

  const fail = (error: unknown) => {
    failure ??= error instanceof Error ? error : new Error(String(error));
  };
  const unzip = new Unzip((stream) => {
    if (failure) return;
    archiveEntryCount++;
    if (archiveEntryCount > limits.maxEntries) {
      fail(new Error(`ZIP exceeds ${limits.maxEntries} entries`));
      return;
    }
    if (stream.originalSize !== undefined && stream.originalSize > limits.maxEntryBytes) {
      fail(new Error(`ZIP entry exceeds ${limits.maxEntryBytes} bytes`));
      return;
    }
    const ignored =
      stream.name.endsWith("/") ||
      !sanitizePath(stream.name) ||
      shouldIgnore(stream.name);
    let entrySize = 0;
    let fd: number | null = null;
    const path = join(directory, String(archiveEntryCount));
    if (!ignored) {
      entryCount++;
      fd = openSync(path, "wx", 0o600);
      openFiles.add(fd);
    }
    unfinishedEntries++;
    stream.ondata = (error, data, final) => {
      if (failure) return;
      if (error) {
        fail(error);
        return;
      }
      if (data) {
        // count actual inflated bytes before retaining or writing the chunk
        if (data.length > limits.maxEntryBytes - entrySize) {
          fail(new Error(`ZIP entry exceeds ${limits.maxEntryBytes} bytes`));
          return;
        }
        if (data.length > limits.maxDecompressedBytes - totalSize) {
          fail(new Error(`ZIP exceeds ${limits.maxDecompressedBytes} decompressed bytes`));
          return;
        }
        entrySize += data.length;
        totalSize += data.length;
        if (fd !== null) {
          if (data.length > limits.maxStagedBytes - stagedBytes) {
            fail(new Error(`ZIP staging exceeds ${limits.maxStagedBytes} bytes`));
            return;
          }
          stagedBytes += data.length;
          try {
            let written = 0;
            while (written < data.length) {
              const count = writeSync(fd, data, written, data.length - written);
              if (!count) throw new Error("Could not write ZIP staging file");
              written += count;
            }
          } catch (writeError) {
            fail(writeError);
            return;
          }
        }
      }
      if (final) {
        unfinishedEntries--;
        if (fd !== null) {
          closeSync(fd);
          openFiles.delete(fd);
          fd = null;
          if (pending.length >= limits.maxPendingEntries) {
            fail(new Error(`ZIP exceeds ${limits.maxPendingEntries} pending entries`));
            return;
          }
          pending.push({ name: stream.name, path, size: entrySize });
        }
      }
    };
    stream.start();
  });
  // synchronous inflation keeps compressed input backpressure effective. Small
  // input slices bound each inflater allocation even when size headers lie
  unzip.register(UnzipInflate);

  const drain = async () => {
    while (pending.length > 0) {
      if (isCancelled()) throw new VaultImportCancelledError();
      const batch: typeof pending = [];
      let bytes = 0;
      while (batch.length < FILE_CONCURRENCY && pending.length > 0) {
        const entry = pending[0];
        if (batch.length > 0 && entry.size > limits.maxEntryBytes - bytes) break;
        batch.push(entry);
        pending.shift();
        bytes += entry.size;
      }
      // settle every active callback before cleanup or reporting a failure
      const results = await Promise.allSettled(
        batch.map(async (entry) => {
          try {
            const buffer = await readFile(entry.path);
            await processEntry(entry.name, buffer);
          } finally {
            await unlink(entry.path);
            stagedBytes -= entry.size;
          }
        }),
      );
      for (const result of results) {
        if (result.status === "rejected") throw result.reason;
      }
    }
  };

  try {
    for await (const chunk of source) {
      if (!(chunk instanceof Uint8Array)) throw new Error("Invalid ZIP stream bytes");
      for (let offset = 0; offset < chunk.length; offset += ZIP_INPUT_SLICE_BYTES) {
        if (isCancelled()) throw new VaultImportCancelledError();
        let bytes = chunk.subarray(offset, offset + ZIP_INPUT_SLICE_BYTES);
        if (!zipSignatureChecked) {
          const needed = 4 - header.length;
          const take = Math.min(needed, bytes.length);
          header = Buffer.concat([header, bytes.subarray(0, take)], header.length + take);
          bytes = bytes.subarray(take);
          if (header.length < 4) continue;
          const signature = header.toString("hex");
          if (signature !== "504b0304" && signature !== "504b0506") {
            throw new Error("Uploaded object is not a ZIP file");
          }
          zipSignatureChecked = true;
          unzip.push(header);
          header = Buffer.alloc(0);
        }
        if (bytes.length > 0) unzip.push(bytes);
        if (failure) throw failure;
        // no completed entry survives into the next compressed input slice
        await drain();
      }
    }
    if (!zipSignatureChecked) throw new Error("Uploaded object is not a ZIP file");
    unzip.push(new Uint8Array(0), true);
    if (failure) throw failure;
    if (unfinishedEntries > 0) throw new Error("ZIP contains unfinished entries");
    await drain();
    return entryCount;
  } finally {
    try {
      for (const fd of openFiles) closeSync(fd);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

async function streamAndProcessZip(
  s3Key: string,
  processEntry: (entryPath: string, buffer: Buffer) => Promise<void>,
  isCancelled: () => boolean,
): Promise<number> {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const bucket = process.env.STORAGE_BUCKET;
  const prefix = process.env.STORAGE_PREFIX || "oghma";
  const fullKey = `${prefix}/${s3Key}`;
  const s3 = createS3ClientFromEnv();
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: fullKey }));
  if (!(res.Body instanceof Readable)) throw new Error("S3 ZIP stream unavailable");
  const readable = res.Body;
  try {
    return await processVaultZipStream(readable, processEntry, {}, isCancelled);
  } finally {
    readable.destroy();
  }
}

/**
 * Main entry point — called from worker-entry.js
 */
export async function processVaultImport(msg: Record<string, unknown>): Promise<void> {
  const { jobId, userId, s3Key } = requireVaultImportMessage(msg);
  const ts = () => new Date().toISOString();
  logger.info(`[${ts()}] Starting vault import: job=${jobId}`);
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
      RETURNING id
    `;
    if (!claimed) {
      logger.info(`[${ts()}] Vault import ${jobId} is already claimed, cancelled, or missing`);
      return;
    }

    const storage = getStorageProvider();
    const folderCache = new Map();
    let totalFiles = 0;
    let totalFolders = 0;
    let failedFiles = 0;

    logger.info(`[${ts()}] Streaming zip from S3: ${s3Key}`);

    const totalEntries = await streamAndProcessZip(
      s3Key,
      async (entryPath, buffer) => {
        if (cancelled) return;
        const cleanPath = sanitizePath(entryPath);
        if (!cleanPath || shouldIgnore(entryPath)) return;

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
          totalFolders = folderCache.size;

          const mimeType = getMimeType(filename);
          const s3FileKey = `vault/${userId}/${jobId}/${cleanPath}`;
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
              });
            } catch (ragErr) {
              logger.error(
                `[${ts()}] RAG failed for ${filename}:`,
                errorMessage(ragErr),
              );
            }
          }

          totalFiles++;
          // poll cancel signal every iteration so small imports are still cancellable;
          // status may also be set directly to 'cancelled' via force=true on the route.
          const [cancelRow] = await sql`
            SELECT cancel_requested_at, status FROM app.canvas_import_jobs
            WHERE id = ${jobId}::uuid
          `;
          if (cancelRow?.cancel_requested_at || cancelRow?.status === "cancelled") {
            logger.info(`[${ts()}] Cancel requested for ${jobId}; aborting after ${totalFiles} files`);
            await sql`
              UPDATE app.canvas_import_jobs
              SET status = 'cancelled', completed_at = NOW(), processed_files = ${totalFiles}, updated_at = NOW()
              WHERE id = ${jobId}::uuid AND status IN ('processing', 'cancelled')
            `;
            cancelled = true;
            return; // exit processEntry — outer streamAndProcessZip will finish naturally
          }
          if (totalFiles % 10 === 0) {
            await sql`
              UPDATE app.canvas_import_jobs
              SET expected_total = ${totalFiles + failedFiles},
                  processed_files = ${totalFiles},
                  updated_at = NOW()
              WHERE id = ${jobId}::uuid AND status = 'processing'
            `;
          }
          logger.info(`[${ts()}] Imported: ${cleanPath}`);
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
                logger.warn(
                  `[${ts()}] Failed to remove cancelled vault object ${uploadedFileKey}:`,
                  errorMessage(cleanupError),
                );
              });
            }
            if (err instanceof VaultImportCancelledError) {
              cancelled = true;
            }
            return;
          }
          failedFiles++;
          logger.error(
            `[${ts()}] Failed to import ${cleanPath}:`,
            errorMessage(err),
          );
        }
      },
      () => cancelled,
    );

    if (cancelled) {
      logger.info(`[${ts()}] Import cancelled for ${jobId}; skipping completion`);
      return;
    }

    // A vault archive is a backup/import contract. Keep successfully created
    // notes, but never report a partial import as complete. Vault jobs are
    // deliberately single-attempt until import replay is idempotent.
    if (failedFiles > 0) {
      throw new Error(
        `Could not import ${failedFiles} file${failedFiles === 1 ? "" : "s"}. Files processed before the error remain in your vault.`,
      );
    }

    // seed initial quiz questions from newly imported chunks (non-fatal)
    try {
      const chunks = await sql<Array<{ id: string }>>`
        SELECT c.id FROM app.chunks c
        WHERE c.user_id = ${userId}::uuid
          AND c.created_at >= (SELECT started_at FROM app.canvas_import_jobs WHERE id = ${jobId}::uuid)
      `;
      const chunkIds = chunks.map((r: { id: string }) => r.id);
      if (chunkIds.length > 0) {
        const { seedQuestionsAfterImport } =
          await import("../quiz/generate-background.ts");
        const seeded = await seedQuestionsAfterImport(userId, chunkIds, 5);
        logger.info(`[${ts()}] Quiz seed: ${seeded} questions generated`);

      }
    } catch (seedErr) {
      logger.warn(
        `[${ts()}] Quiz seed failed (non-fatal): ${errorMessage(seedErr)}`,
      );
    }

    const completed = await sql`
      UPDATE app.canvas_import_jobs
      SET status = 'complete', processed_files = ${totalFiles}, expected_total = ${totalEntries || totalFiles + failedFiles}, completed_at = NOW(), updated_at = NOW()
      WHERE id = ${jobId}::uuid AND status = 'processing'
      RETURNING id
    `;
    if (completed.length === 0) {
      logger.info(`[${ts()}] Import ${jobId} finished but row was already terminal (cancelled/failed); skipping email`);
      return;
    }


    try {
      const [user] =
        await sql`SELECT email FROM app.login WHERE user_id = ${userId}::uuid`;
      if (user?.email) {
        await sendVaultImportCompleteEmail(user.email, {
          totalFiles,
          totalFolders,
          failedFiles,
        });
      }
    } catch (emailErr) {
      logger.error(`[${ts()}] Email notification failed:`, errorMessage(emailErr));
    }

    logger.info(
      `[${ts()}] Vault import complete: ${totalFiles} files, ${totalFolders} folders, ${failedFiles} failures`,
    );
  } catch (error) {
    if (cancelled) {
      logger.warn(`[${ts()}] Ignoring error after cancel for ${jobId}: ${errorMessage(error)}`);
      return;
    }
    logger.error(`[${ts()}] Vault import failed:`, error);
    await sql`
      UPDATE app.canvas_import_jobs
      SET status = 'failed', error_message = ${errorMessage(error)}, completed_at = NOW(), updated_at = NOW()
      WHERE id = ${jobId}::uuid AND status = 'processing'
    `;
    throw error;
  }
}
