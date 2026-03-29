/**
 * Vault Export Worker
 * Queries user's tree, streams files from S3, builds a zip via fflate's
 * streaming Zip class, and uploads to S3 via multipart upload.
 */

import sql from "../../database/pgsql.js";
import { Zip, ZipPassThrough, ZipDeflate } from "fflate";
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getStorageProvider } from "../storage/init.ts";
import { buildExportPathMap } from "./tree-builder.js";
import { sendVaultExportCompleteEmail } from "../email.js";

const MIN_PART_SIZE = 5 * 1024 * 1024; // 5MB minimum for S3 multipart

/**
 * Stream zip data into S3 via multipart upload.
 * Collects chunks until they reach MIN_PART_SIZE, then uploads each part.
 */
class S3MultipartZipUploader {
  constructor(s3, bucket, key) {
    this.s3 = s3;
    this.bucket = bucket;
    this.key = key;
    this.uploadId = null;
    this.parts = [];
    this.partNumber = 1;
    this.buffer = [];
    this.bufferSize = 0;
  }

  async init() {
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
  addChunk(data) {
    this.buffer.push(Buffer.from(data));
    this.bufferSize += data.length;
  }

  async flushPart() {
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

  async complete() {
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

  async abort() {
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
          err.message,
        );
      }
    }
  }
}

/**
 * Main entry point — called from worker-entry.js
 */
export async function processVaultExport(msg) {
  const { jobId, userId } = msg;
  const ts = () => new Date().toISOString();
  console.log(`[${ts()}] Starting vault export: job=${jobId}`);

  const bucket = process.env.STORAGE_BUCKET;
  const prefix = process.env.STORAGE_PREFIX || "oghma";
  const s3 = new S3Client({
    region: process.env.STORAGE_REGION || "us-east-1",
  });
  const outputKey = `${prefix}/exports/${userId}/${jobId}/vault-export.zip`;

  const uploader = new S3MultipartZipUploader(s3, bucket, outputKey);

  try {
    await sql`UPDATE app.canvas_import_jobs SET status = 'processing', started_at = NOW() WHERE id = ${jobId}::uuid`;

    const storage = getStorageProvider();
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
        let fileData;

        if (s3Key) {
          // download file from S3
          const fullS3Key = `${prefix}/${s3Key}`;
          const res = await s3.send(
            new GetObjectCommand({ Bucket: bucket, Key: fullS3Key }),
          );
          const chunks = [];
          for await (const chunk of res.Body) {
            chunks.push(chunk);
          }
          fileData = Buffer.concat(chunks);
        } else if (content !== null && content !== undefined) {
          // text note — write as UTF-8
          fileData = Buffer.from(content, "utf-8");
        } else {
          console.log(
            `[${ts()}] Skipping note ${noteId}: no s3_key and no content`,
          );
          continue;
        }

        // add to zip — use ZipPassThrough for already-compressed files, ZipDeflate for text
        const isText =
          path.endsWith(".md") ||
          path.endsWith(".txt") ||
          path.endsWith(".markdown");
        const zipEntry = isText
          ? new ZipDeflate(path, { level: 6 })
          : new ZipPassThrough(path);

        zip.add(zipEntry);
        zipEntry.push(new Uint8Array(fileData), true);

        // flush buffered zip data to S3 (async — safe here in the for loop)
        if (uploader.bufferSize >= MIN_PART_SIZE) {
          await uploader.flushPart();
        }

        processed++;
        if (processed % 50 === 0) {
          await sql`UPDATE app.canvas_import_jobs SET updated_at = NOW() WHERE id = ${jobId}::uuid`;
          console.log(`[${ts()}] Exported ${processed}/${totalFiles} files`);
        }
      } catch (err) {
        console.error(`[${ts()}] Failed to export ${entry.path}:`, err.message);
        // continue with other files
      }
    }

    // finalize zip
    zip.end();

    // complete the multipart upload (flushes remaining buffer + finalizes)
    await uploader.complete();

    // generate 24-hour presigned download URL
    const downloadUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: bucket, Key: outputKey }),
      { expiresIn: 86400 },
    );

    // update job with results
    const outputS3Key = `exports/${userId}/${jobId}/vault-export.zip`;
    await sql`
      UPDATE app.canvas_import_jobs
      SET status = 'complete',
          completed_at = NOW(),
          updated_at = NOW(),
          output_s3_key = ${outputS3Key},
          download_url = ${downloadUrl}
      WHERE id = ${jobId}::uuid
    `;

    // send email notification
    try {
      const [user] =
        await sql`SELECT email FROM app.login WHERE user_id = ${userId}::uuid`;
      if (user?.email) {
        await sendVaultExportCompleteEmail(user.email, { downloadUrl });
      }
    } catch (emailErr) {
      console.error(`[${ts()}] Email notification failed:`, emailErr.message);
    }

    console.log(`[${ts()}] Vault export complete: ${processed} files`);
  } catch (error) {
    console.error(`[${ts()}] Vault export failed:`, error);
    await uploader.abort();
    await sql`
      UPDATE app.canvas_import_jobs
      SET status = 'failed', error_message = ${error.message}, completed_at = NOW(), updated_at = NOW()
      WHERE id = ${jobId}::uuid
    `;
    throw error;
  }
}
