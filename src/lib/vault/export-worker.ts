import logger from "@/lib/logger";
/**
 * Vault Export Worker
 * Walks the user's tree, streams each file from S3 through fflate's
 * streaming Zip, and uploads the archive to S3 via multipart upload. Memory
 * stays around one part size no matter how large the vault or a file is.
 */

import sql from "../../database/pgsql";
import { Zip, ZipDeflate } from "fflate";
import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  type CompletedPart,
  type S3Client,
} from "@aws-sdk/client-s3";
import { createS3ClientFromEnv } from "../storage/s3.ts";
import { getStorageProvider } from "../storage/init.ts";
import { buildExportPathMap, type ExportEntry } from "./tree-builder";
import {
  lockVaultExport,
  signVaultExportDownload,
  VAULT_EXPORT_DOWNLOAD_SECONDS,
  vaultExportKey,
  vaultStorageLocation,
} from "./artifacts";
import {
  heartbeatVaultJob,
  markVaultJobCancelled,
  markVaultJobFailed,
} from "./jobs";
import { sendVaultExportCompleteEmail } from "../email";

// R2 rejects a multipart upload unless every part but the last has the same
// size, so parts are cut at exactly this length rather than "at least" it
const PART_SIZE = 8 * 1024 * 1024;

class VaultExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultExportError";
  }
}

/**
 * Stream zip data into S3 via multipart upload.
 * Collects chunks and uploads them as fixed PART_SIZE parts plus one final remainder.
 */
class S3MultipartZipUploader {
  private uploadId: string | undefined;
  private readonly parts: CompletedPart[] = [];
  private partNumber = 1;
  private buffer: Buffer[] = [];
  private bufferSize = 0;

  constructor(
    private readonly s3: S3Client,
    private readonly bucket: string,
    private readonly key: string,
  ) {
  }

  async init(): Promise<void> {
    const res = await this.s3.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: this.key,
        ContentType: "application/zip",
      }),
    );
    this.uploadId = res.UploadId;
  }

  // synchronous — safe to call from fflate's sync ondata callback
  addChunk(data: Uint8Array): void {
    this.buffer.push(Buffer.from(data));
    this.bufferSize += data.length;
  }

  async flushFullParts(): Promise<void> {
    if (this.bufferSize < PART_SIZE) return;
    const data = Buffer.concat(this.buffer);
    let offset = 0;
    while (data.length - offset >= PART_SIZE) {
      await this.uploadPart(data.subarray(offset, offset + PART_SIZE));
      offset += PART_SIZE;
    }
    // copy the remainder so the large concatenated buffer can be released
    const rest = Buffer.from(data.subarray(offset));
    this.buffer = rest.length > 0 ? [rest] : [];
    this.bufferSize = rest.length;
  }

  private async uploadPart(body: Buffer): Promise<void> {
    const res = await this.s3.send(
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: this.key,
        UploadId: this.uploadId,
        PartNumber: this.partNumber,
        Body: body,
      }),
    );

    this.parts.push({ PartNumber: this.partNumber, ETag: res.ETag });
    this.partNumber++;
  }

  async complete(): Promise<void> {
    await this.flushFullParts();
    // the trailing part may be any size, and a tiny archive is a single part
    if (this.bufferSize > 0 || this.parts.length === 0) {
      const body = Buffer.concat(this.buffer);
      this.buffer = [];
      this.bufferSize = 0;
      await this.uploadPart(body);
    }

    await this.s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: this.key,
        UploadId: this.uploadId,
        MultipartUpload: { Parts: this.parts },
      }),
    );
  }

  async abort(): Promise<void> {
    if (this.uploadId) {
      try {
        await this.s3.send(
          new AbortMultipartUploadCommand({
            Bucket: this.bucket,
            Key: this.key,
            UploadId: this.uploadId,
          }),
        );
      } catch (error) {
        logger.error("vault export multipart abort failed", { error });
      }
    }
  }
}

function requireMessageString(
  message: Record<string, unknown>,
  field: string,
): string {
  const value = message[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Vault export message field ${field} is missing or invalid`);
  }
  return value;
}

function isTextPath(path: string): boolean {
  return /\.(md|markdown|txt)$/i.test(path);
}

async function* noteContentChunks(
  userId: string,
  noteId: string,
): AsyncGenerator<Uint8Array> {
  const [note] = await sql<{ content: string | null }[]>`
    SELECT content FROM app.notes
    WHERE note_id = ${noteId}::uuid AND user_id = ${userId}::uuid
  `;
  // a note deleted mid-export is simply not part of this archive
  if (!note) return;
  yield Buffer.from(note.content ?? "", "utf-8");
}

async function* objectChunks(key: string): AsyncGenerator<Uint8Array> {
  const { body } = await getStorageProvider().getObjectStream(key);
  try {
    for await (const chunk of body) {
      if (!(chunk instanceof Uint8Array)) throw new Error("Invalid storage stream bytes");
      yield chunk;
    }
  } finally {
    body.destroy();
  }
}

/**
 * Stream one entry into the archive, uploading parts as they fill. A failed
 * source still closes its entry so the archive stream stays well-formed and
 * later failures can be collected; the whole archive is discarded anyway.
 */
async function writeZipEntry(
  zip: Zip,
  uploader: S3MultipartZipUploader,
  entry: ExportEntry,
  chunks: AsyncIterable<Uint8Array>,
): Promise<void> {
  // always deflate (even level 1) so stored Office files cannot leak their own
  // inner zip entries when the archive is re-imported by the streaming reader
  const zipEntry = new ZipDeflate(entry.path, { level: isTextPath(entry.path) ? 6 : 1 });
  zip.add(zipEntry);
  try {
    for await (const chunk of chunks) {
      zipEntry.push(chunk);
      await uploader.flushFullParts();
    }
  } finally {
    zipEntry.push(new Uint8Array(0), true);
  }
  await uploader.flushFullParts();
}

/**
 * Main entry point — called from worker-entry.ts
 */
export async function processVaultExport(
  msg: Record<string, unknown>,
): Promise<void> {
  const jobId = requireMessageString(msg, "jobId");
  const userId = requireMessageString(msg, "userId");
  logger.info("vault export started");

  const outputKey = vaultExportKey(userId, jobId);
  // multipart isn't wrapped by the provider, so it writes the prefixed key directly
  const output = vaultStorageLocation(outputKey);
  const uploader = new S3MultipartZipUploader(
    createS3ClientFromEnv(),
    output.bucket,
    output.key,
  );

  try {
    const [claimed] = await sql`
      UPDATE app.canvas_import_jobs
      SET status = 'processing', started_at = NOW(), updated_at = NOW()
      WHERE id = ${jobId}::uuid AND user_id = ${userId}::uuid
        AND type = 'vault-export' AND status = 'queued'
        AND cancel_requested_at IS NULL
      RETURNING id
    `;
    if (!claimed) return;

    const entries = await buildExportPathMap(userId);
    logger.info("vault export paths built");
    await sql`
      UPDATE app.canvas_import_jobs
      SET expected_total = ${entries.length}, updated_at = NOW()
      WHERE id = ${jobId}::uuid
    `;

    await uploader.init();

    // ondata is synchronous, so it only buffers; parts are flushed between pushes
    const zip = new Zip();
    zip.ondata = (err, data) => {
      if (err) throw err;
      if (data.length > 0) uploader.addChunk(data);
    };

    let processed = 0;
    const failedPaths: string[] = [];

    for (const entry of entries) {
      const chunks = entry.source.kind === "object"
        ? objectChunks(entry.source.s3Key)
        : noteContentChunks(userId, entry.source.noteId);
      try {
        await writeZipEntry(zip, uploader, entry, chunks);
      } catch (error) {
        logger.error("vault export entry failed", { error });
        failedPaths.push(entry.path);
      }

      processed++;
      // the heartbeat doubles as the cancel poll, so small exports stay cancellable
      const state = await heartbeatVaultJob(jobId, userId, processed);
      if (state !== "active") {
        logger.info("vault export stopped: job no longer active");
        await uploader.abort();
        if (state === "cancel-requested") await markVaultJobCancelled(jobId, processed);
        return;
      }
    }

    // A vault archive is a backup contract. Do not present a partial archive as
    // complete: abort it and keep the failed job visible for a deliberate retry.
    if (failedPaths.length > 0) {
      const examples = failedPaths.slice(0, 3).join(", ");
      throw new VaultExportError(
        `Could not export ${failedPaths.length} file${failedPaths.length === 1 ? "" : "s"}${examples ? `: ${examples}` : ""}`,
      );
    }

    zip.end();

    // completion and cleanup take the same lock, so a cancelled worker cannot publish a late copy
    const outcome = await sql.begin(async (tx) => {
      await lockVaultExport(tx, userId);
      const [job] = await tx<{ cancel_requested_at: Date | string | null }[]>`
        SELECT j.cancel_requested_at FROM app.canvas_import_jobs j
        JOIN app.vault_artifacts a ON a.job_id = j.id AND a.kind = 'export'
        WHERE j.id = ${jobId}::uuid AND j.user_id = ${userId}::uuid
          AND j.status = 'processing'
        FOR UPDATE OF j, a
      `;
      if (!job) return "gone" as const;
      if (job.cancel_requested_at) {
        // a cancel that lands after the last heartbeat must still finish the job
        await tx`
          UPDATE app.canvas_import_jobs
          SET status = 'cancelled', completed_at = NOW(), processed_files = ${processed}, updated_at = NOW()
          WHERE id = ${jobId}::uuid
        `;
        return "cancelled" as const;
      }
      await uploader.complete();
      await tx`
        UPDATE app.canvas_import_jobs
        SET status = 'complete', processed_files = ${processed}, completed_at = NOW(), updated_at = NOW(),
          output_s3_key = ${outputKey}
        WHERE id = ${jobId}::uuid
      `;
      await tx`
        UPDATE app.vault_artifacts
        SET expires_at = NOW() + INTERVAL '24 hours'
        WHERE job_id = ${jobId}::uuid AND kind = 'export'
      `;
      return "complete" as const;
    });
    if (outcome !== "complete") {
      await uploader.abort();
      return;
    }

    try {
      const downloadUrl = await signVaultExportDownload(
        outputKey,
        VAULT_EXPORT_DOWNLOAD_SECONDS,
      );
      const [user] = await sql<{ email: string }[]>`
        SELECT email FROM app.login WHERE user_id = ${userId}::uuid
      `;
      if (user?.email) {
        await sendVaultExportCompleteEmail(user.email, { downloadUrl });
      }
    } catch (error) {
      logger.error("vault export email failed", { error });
    }

    logger.info("vault export completed");
  } catch (error) {
    logger.error("vault export failed", { error });
    await uploader.abort();
    // only the partial-archive message is meant for users; internal errors can carry hostnames
    await markVaultJobFailed(
      jobId,
      error instanceof VaultExportError
        ? error.message
        : "Export failed. Please try again.",
    );
    throw error;
  }
}
