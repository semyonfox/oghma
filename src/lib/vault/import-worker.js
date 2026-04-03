/**
 * Vault Import Worker
 * Streams a zip file from S3, creates folders + notes in the user's tree,
 * and runs the full RAG pipeline (OCR, chunking, embeddings) on supported file types.
 *
 * Uses fflate's streaming Unzip for flat ~200MB memory regardless of zip size.
 */

import sql from "../../database/pgsql.js";
import { v4 as uuidv4 } from "uuid";
import { Readable } from "stream";
import { AsyncUnzipInflate, Unzip } from "fflate";
import { chunkText } from "../chunking.ts";
import { replaceNoteEmbeddings } from "../rag/indexing.ts";
import { stripMarkdown } from "../strip-markdown.ts";
import { getStorageProvider } from "../storage/init.ts";
import { addNoteToTree } from "../notes/storage/pg-tree.js";
import { extractWithMarker } from "../ocr.ts";
import {
  shouldIgnore,
  sanitizePath,
  ensureFolderPath,
} from "./tree-builder.js";
import { sendVaultImportCompleteEmail } from "../email.js";

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

const EXT_MIME = {
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

function getMimeType(filename) {
  const ext = filename?.toLowerCase().split(".").pop();
  return ext && EXT_MIME[ext] ? EXT_MIME[ext] : null;
}

function isProcessable(filename) {
  const ext = filename?.toLowerCase().split(".").pop();
  return PROCESSABLE_EXTS.has(ext);
}

async function createNote(userId, title, parentId, opts = {}) {
  const noteId = uuidv4();
  const s3Key = opts.s3Key ?? null;
  const content = opts.content ?? "";
  await sql`
    INSERT INTO app.notes (note_id, user_id, title, content, s3_key, is_folder, deleted, created_at, updated_at)
    VALUES (${noteId}::uuid, ${userId}::uuid, ${title}, ${content}, ${s3Key}, false, 0, NOW(), NOW())
  `;
  await addNoteToTree(userId, noteId, parentId ?? null);
  return noteId;
}

async function findOrCreateNote(userId, title, parentId, opts = {}) {
  const existing = await sql`
    SELECT n.note_id FROM app.notes n
    JOIN app.tree_items t ON t.note_id = n.note_id AND t.user_id = n.user_id
    WHERE n.user_id = ${userId}::uuid
      AND n.title = ${title}
      AND n.is_folder = false
      AND n.deleted = 0
      AND ${parentId ? sql`t.parent_id = ${parentId}::uuid` : sql`t.parent_id IS NULL`}
    LIMIT 1
  `;
  if (existing.length > 0) {
    return { noteId: existing[0].note_id, created: false };
  }

  const noteId = await createNote(userId, title, parentId, opts);
  return { noteId, created: true };
}

async function processRagPipeline(
  noteId,
  userId,
  parentFolderId,
  buffer,
  opts,
) {
  const { filename, mimeType } = opts;
  const isText = mimeType?.startsWith("text/");

  let rawText;
  let chunks;

  if (isText) {
    rawText = buffer.toString("utf-8");
    chunks = chunkText(rawText);
  } else {
    const marker = await extractWithMarker(buffer, filename ?? "document.pdf");
    rawText = marker.text;
    chunks = marker.chunks;
  }

  const searchText = stripMarkdown(rawText);

  if (isText) {
    await sql`
      UPDATE app.notes
      SET content = ${rawText}, extracted_text = ${searchText}, updated_at = NOW()
      WHERE note_id = ${noteId}::uuid
    `;
    const count = await replaceNoteEmbeddings(noteId, userId, chunks);
    console.log(`[vault-import] RAG: ${count} chunks for text note ${noteId}`);
    return;
  }

  // binary docs: create sibling .md note
  const mdTitle = filename.replace(/\.[^.]+$/, "") + ".md";
  const { noteId: mdNoteId } = await findOrCreateNote(
    userId,
    mdTitle,
    parentFolderId,
    {
      content: rawText,
    },
  );
  await sql`
    UPDATE app.notes
    SET content = ${rawText}, extracted_text = ${searchText}, updated_at = NOW()
    WHERE note_id = ${mdNoteId}::uuid
  `;
  const count = await replaceNoteEmbeddings(mdNoteId, userId, chunks);
  console.log(
    `[vault-import] RAG: ${count} chunks for MD note ${mdNoteId} (source: ${noteId})`,
  );
}

/**
 * Bounded async queue — bridges fflate's sync callbacks to async processing.
 * The producer (Unzip ondata) pushes entries synchronously.
 * The consumer drains entries with a concurrency limit, releasing buffers
 * after each file so memory stays bounded (~FILE_CONCURRENCY * largest file).
 */
class EntryQueue {
  constructor(concurrency) {
    this.concurrency = concurrency;
    this.queue = [];
    this.running = 0;
    this.done = false;
    this._resolve = null;
  }

  push(entry) {
    this.queue.push(entry);
    this._tryDrain();
  }

  _tryDrain() {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const entry = this.queue.shift();
      this.running++;
      entry
        .process()
        .catch(() => {}) // errors handled inside process()
        .finally(() => {
          this.running--;
          entry.buffer = null; // release buffer for GC
          this._tryDrain();
          if (this.done && this.running === 0 && this.queue.length === 0) {
            this._resolve?.();
          }
        });
    }
  }

  // call after extraction is complete, resolves when all processing finishes
  finish() {
    this.done = true;
    if (this.running === 0 && this.queue.length === 0) return Promise.resolve();
    return new Promise((r) => {
      this._resolve = r;
    });
  }
}

/**
 * Stream zip from S3, process entries as they decompress.
 * Memory stays bounded at ~FILE_CONCURRENCY * largest_file_size.
 */
async function streamAndProcessZip(s3Key, userId, jobId, processEntry) {
  const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");

  const bucket = process.env.STORAGE_BUCKET;
  const prefix = process.env.STORAGE_PREFIX || "oghma";
  const fullKey = `${prefix}/${s3Key}`;

  const s3 = new S3Client({
    region: process.env.STORAGE_REGION || "us-east-1",
  });
  const res = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: fullKey }),
  );
  if (!res.Body) throw new Error(`S3 object not found: ${fullKey}`);

  const entryQueue = new EntryQueue(FILE_CONCURRENCY);
  let entryCount = 0;
  let totalSize = 0;

  return new Promise((resolve, reject) => {
    const unzip = new Unzip((stream) => {
      if (stream.name.endsWith("/")) return;

      entryCount++;
      if (entryCount > MAX_ENTRIES) {
        reject(
          new Error(`Zip bomb protection: more than ${MAX_ENTRIES} entries`),
        );
        return;
      }

      const chunks = [];
      stream.ondata = (err, data, final) => {
        if (err) {
          reject(err);
          return;
        }
        if (data) {
          totalSize += data.length;
          if (totalSize > MAX_DECOMPRESSED_SIZE) {
            reject(
              new Error(
                `Zip bomb protection: decompressed size exceeds ${MAX_DECOMPRESSED_SIZE / (1024 * 1024 * 1024)}GB`,
              ),
            );
            return;
          }
          chunks.push(data);
        }
        if (final) {
          const buffer = Buffer.concat(chunks);
          const entry = { path: stream.name, buffer, process: null };
          entry.process = () => processEntry(entry.path, entry.buffer);
          entryQueue.push(entry);
        }
      };
      stream.start();
    });

    unzip.register(AsyncUnzipInflate);

    const readable = Readable.from(res.Body);
    readable.on("data", (chunk) => {
      unzip.push(Buffer.isBuffer(chunk) ? new Uint8Array(chunk) : chunk);
    });
    readable.on("end", () => {
      unzip.push(new Uint8Array(0), true);
      entryQueue
        .finish()
        .then(() => resolve(entryCount))
        .catch(reject);
    });
    readable.on("error", reject);
  });
}

/**
 * Main entry point — called from worker-entry.js
 */
export async function processVaultImport(msg) {
  const { jobId, userId, s3Key } = msg;
  const ts = () => new Date().toISOString();
  console.log(`[${ts()}] Starting vault import: job=${jobId}`);

  try {
    await sql`UPDATE app.canvas_import_jobs SET status = 'processing', started_at = NOW() WHERE id = ${jobId}::uuid`;

    const storage = getStorageProvider();
    const folderCache = new Map();
    let totalFiles = 0;
    let totalFolders = 0;
    let failedFiles = 0;

    console.log(`[${ts()}] Streaming zip from S3: ${s3Key}`);

    const totalEntries = await streamAndProcessZip(
      s3Key,
      userId,
      jobId,
      async (entryPath, buffer) => {
        const cleanPath = sanitizePath(entryPath);
        if (!cleanPath || shouldIgnore(entryPath)) return;

        const filename = cleanPath.split("/").pop();
        if (!filename) return;

        try {
          const parentId = await ensureFolderPath(
            userId,
            cleanPath,
            folderCache,
          );
          totalFolders = folderCache.size;

          const mimeType = getMimeType(filename);
          const s3FileKey = `vault/${userId}/${jobId}/${cleanPath}`;

          await storage.putObject(s3FileKey, buffer, {
            contentType: mimeType || "application/octet-stream",
          });

          const noteId = await createNote(userId, filename, parentId, {
            s3Key: s3FileKey,
            content: mimeType?.startsWith("text/")
              ? buffer.toString("utf-8")
              : "",
          });

          await sql`
            INSERT INTO app.attachments (id, note_id, user_id, filename, s3_key, mime_type, file_size)
            VALUES (${uuidv4()}::uuid, ${noteId}::uuid, ${userId}::uuid,
                    ${filename}, ${s3FileKey}, ${mimeType || "application/octet-stream"}, ${buffer.length})
          `;

          if (isProcessable(filename)) {
            try {
              await processRagPipeline(noteId, userId, parentId, buffer, {
                filename,
                mimeType,
              });
            } catch (ragErr) {
              console.error(
                `[${ts()}] RAG failed for ${filename}:`,
                ragErr.message,
              );
            }
          }

          totalFiles++;
          if (totalFiles % 10 === 0) {
            await sql`UPDATE app.canvas_import_jobs SET expected_total = ${totalFiles + failedFiles}, updated_at = NOW() WHERE id = ${jobId}::uuid`;
          }
          console.log(`[${ts()}] Imported: ${cleanPath}`);
        } catch (err) {
          failedFiles++;
          console.error(
            `[${ts()}] Failed to import ${cleanPath}:`,
            err.message,
          );
        }
      },
    );

    // seed initial quiz questions from newly imported chunks (non-fatal)
    try {
      const chunks = await sql`
        SELECT c.id FROM app.chunks c
        WHERE c.user_id = ${userId}::uuid
          AND c.created_at >= (SELECT started_at FROM app.canvas_import_jobs WHERE id = ${jobId}::uuid)
      `;
      const chunkIds = chunks.map((r) => r.id);
      if (chunkIds.length > 0) {
        const { seedQuestionsAfterImport } =
          await import("../quiz/generate-background.ts");
        const seeded = await seedQuestionsAfterImport(userId, chunkIds, 5);
        console.log(`[${ts()}] Quiz seed: ${seeded} questions generated`);
      }
    } catch (seedErr) {
      console.warn(
        `[${ts()}] Quiz seed failed (non-fatal): ${seedErr.message}`,
      );
    }

    await sql`
      UPDATE app.canvas_import_jobs
      SET status = 'complete', expected_total = ${totalEntries || totalFiles + failedFiles}, completed_at = NOW(), updated_at = NOW()
      WHERE id = ${jobId}::uuid
    `;

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
      console.error(`[${ts()}] Email notification failed:`, emailErr.message);
    }

    console.log(
      `[${ts()}] Vault import complete: ${totalFiles} files, ${totalFolders} folders, ${failedFiles} failures`,
    );
  } catch (error) {
    console.error(`[${ts()}] Vault import failed:`, error);
    await sql`
      UPDATE app.canvas_import_jobs
      SET status = 'failed', error_message = ${error.message}, completed_at = NOW(), updated_at = NOW()
      WHERE id = ${jobId}::uuid
    `;
    throw error;
  }
}
