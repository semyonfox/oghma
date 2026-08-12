/**
 * Vault Export Worker
 * Queries user's tree, streams files from S3, builds a zip via fflate's
 * streaming Zip class, and uploads to S3 via multipart upload.
 */

import sql from "../../database/pgsql";
import { Zip, ZipDeflate } from "fflate";
import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  GetObjectCommand,
  type CompletedPart,
  type S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getStorageProvider } from "../storage/init.ts";
import { createS3ClientFromEnv } from "../storage/s3.ts";
import { buildExportPathMap } from "./tree-builder";
import { sendVaultExportCompleteEmail } from "../email";

const MIN_PART_SIZE = 5 * 1024 * 1024; // 5MB minimum for S3 multipart

/**
 * Stream zip data into S3 via multipart upload.
 * Collects chunks until they reach MIN_PART_SIZE, then uploads each part.
 */
class S3MultipartZipUploader {
  private uploadId: string | undefined;
  private readonly parts: CompletedPart[] = [];
  private partNumber = 1;
  private buffer: Buffer[] = [];
  public bufferSize = 0;

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

  async flushPart(): Promise<void> {
    if (this.bufferSize === 0) return;
    const body = Buffer.concat(this.buffer);
    this.buffer = [];
    this.bufferSize = 0;

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
    // flush remaining buffered data
    await this.flushPart();

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
      } catch (err) {
        console.error(
          "[vault-export] Failed to abort multipart upload:",
          errorMessage(err),
        );
      }
    }
  }
}

/**
 * Main entry point — called from worker-entry.ts
 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

export async function processVaultExport(
  msg: Record<string, unknown>,
): Promise<void> {
  const jobId = requireMessageString(msg, "jobId");
  const userId = requireMessageString(msg, "userId");
  const ts = () => new Date().toISOString();
  console.log(`[${ts()}] Starting vault export: job=${jobId}`);

  const bucket = process.env.STORAGE_BUCKET;
  const prefix = process.env.STORAGE_PREFIX || "oghma";
  const s3 = createS3ClientFromEnv();
  if (!bucket) {
    throw new Error("Missing required environment variable: STORAGE_BUCKET");
  }
  const outputKey = `${prefix}/exports/${userId}/${jobId}/vault-export.zip`;

  const uploader = new S3MultipartZipUploader(s3, bucket, outputKey);

  try {
    await sql`UPDATE app.canvas_import_jobs SET status = 'processing', started_at = NOW() WHERE id = ${jobId}::uuid`;

    getStorageProvider();
    const exportMap = await buildExportPathMap(userId);
    const totalFiles = exportMap.size;

    console.log(`[${ts()}] Found ${totalFiles} files to export`);
    await sql`UPDATE app.canvas_import_jobs SET expected_total = ${totalFiles} WHERE id = ${jobId}::uuid`;

    await uploader.init();

    // build the zip using fflate's streaming Zip
    // ondata is synchronous — buffer chunks, flush async after each file
    const zip = new Zip();
    zip.ondata = (err, data, _final) => {
      if (err) throw err;
      if (data.length > 0) {
        uploader.addChunk(data); // sync buffer
      }
    };

    let processed = 0;

    for (const [noteId, entry] of exportMap) {
      try {
        const { path, s3Key, content } = entry;
        let fileData: Buffer;

        if (s3Key) {
          // download file from S3
          const fullS3Key = `${prefix}/${s3Key}`;
          const res = await s3.send(
            new GetObjectCommand({ Bucket: bucket, Key: fullS3Key }),
          );
          if (!res.Body) {
            throw new Error(`Storage object ${fullS3Key} returned no body`);
          }
          fileData = Buffer.from(await res.Body.transformToByteArray());
        } else if (content !== null && content !== undefined) {
          // text note — write as UTF-8
          fileData = Buffer.from(content, "utf-8");
        } else {
          console.log(
            `[${ts()}] Skipping note ${noteId}: no s3_key and no content`,
          );
          continue;
        }

        // always use ZipDeflate to avoid nested-zip entry leakage when
        // importing archives that contain zip-based formats (.pptx/.docx/.xlsx)
        const isText =
          path.endsWith(".md") ||
          path.endsWith(".txt") ||
          path.endsWith(".markdown");
        const zipEntry = new ZipDeflate(path, { level: isText ? 6 : 1 });

        zip.add(zipEntry);
        zipEntry.push(new Uint8Array(fileData), true);

        // flush buffered zip data to S3 (async — safe here in the for loop)
        if (uploader.bufferSize >= MIN_PART_SIZE) {
          await uploader.flushPart();
        }

        processed++;
        // poll cancel signal every iteration so small jobs are still cancellable;
        // status may also be set directly to 'cancelled' via force=true on the route.
        const [cancelRow] = await sql<
          { cancel_requested_at: Date | string | null; status: string }[]
        >`
          SELECT cancel_requested_at, status FROM app.canvas_import_jobs
          WHERE id = ${jobId}::uuid
        `;
        if (cancelRow?.cancel_requested_at || cancelRow?.status === "cancelled") {
          console.log(`[${ts()}] Cancel requested for ${jobId}; aborting after ${processed} files`);
          await uploader.abort();
          await sql`
            UPDATE app.canvas_import_jobs
            SET status = 'cancelled', completed_at = NOW(), processed_files = ${processed}, updated_at = NOW()
            WHERE id = ${jobId}::uuid AND status IN ('processing', 'cancelled')
          `;
          return; // exit the worker function
        }
        if (processed % 50 === 0) {
          await sql`
            UPDATE app.canvas_import_jobs
            SET processed_files = ${processed}, updated_at = NOW()
            WHERE id = ${jobId}::uuid AND status = 'processing'
          `;
          console.log(`[${ts()}] Exported ${processed}/${totalFiles} files`);
        }
      } catch (err) {
        console.error(
          `[${ts()}] Failed to export ${entry.path}:`,
          errorMessage(err),
        );
        // continue with other files
      }
    }

    // final progress flush
    await sql`
      UPDATE app.canvas_import_jobs
      SET processed_files = ${processed}
      WHERE id = ${jobId}::uuid
    `;

    // finalize zip
    zip.end();

    // complete the multipart upload (flushes remaining buffer + finalizes)
    await uploader.complete();

    // generate 24-hour presigned download URL
    const downloadUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: bucket,
        Key: outputKey,
        ResponseContentDisposition: 'attachment; filename="oghmanotes-vault.zip"',
      }),
      { expiresIn: 86400 },
    );

    // update job with results — guard against overwriting a cancelled job
    const outputS3Key = `exports/${userId}/${jobId}/vault-export.zip`;
    const completed = await sql<{ id: string }[]>`
      UPDATE app.canvas_import_jobs
      SET status = 'complete',
          completed_at = NOW(),
          updated_at = NOW(),
          output_s3_key = ${outputS3Key},
          download_url = ${downloadUrl}
      WHERE id = ${jobId}::uuid AND status = 'processing'
      RETURNING id
    `;
    if (completed.length === 0) {
      console.log(`[${ts()}] Export ${jobId} finished but row was already terminal (cancelled/failed); skipping email`);
      return;
    }

    // send email notification
    try {
      const [user] = await sql<{ email: string }[]>`
        SELECT email FROM app.login WHERE user_id = ${userId}::uuid
      `;
      if (user?.email) {
        await sendVaultExportCompleteEmail(user.email, { downloadUrl });
      }
    } catch (emailErr) {
      console.error(
        `[${ts()}] Email notification failed:`,
        errorMessage(emailErr),
      );
    }

    console.log(`[${ts()}] Vault export complete: ${processed} files`);
  } catch (error) {
    console.error(`[${ts()}] Vault export failed:`, error);
    await uploader.abort();
    await sql`
      UPDATE app.canvas_import_jobs
      SET status = 'failed', error_message = ${errorMessage(error)}, completed_at = NOW(), updated_at = NOW()
      WHERE id = ${jobId}::uuid AND status = 'processing'
    `;
    throw error;
  }
}
