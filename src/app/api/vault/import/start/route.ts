import { NextResponse } from "next/server";
import type postgres from "postgres";
import { withErrorHandler, requireAuth, ApiError, parseJsonObject } from "@/lib/api-error";
import { lockVaultArtifacts, VAULT_UPLOAD_MAX_BYTES } from "@/lib/vault/artifacts";
import sql from "@/database/pgsql";
import { enqueueCanvasJob } from "@/lib/queue";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createS3ClientConfig, createS3ConfigFromEnv } from "@/lib/storage/s3";

interface VaultJobIdRow {
  id: string;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}

/**
 * POST /api/vault/import/start
 *
 * Creates a vault-import job after the zip has been uploaded to S3.
 * Returns 409 if an active import already exists; pass force=true in body to cancel and replace.
 * Body: { s3Key: string, force?: boolean }
 * Response: { jobId }
 */
export const POST = withErrorHandler(async (request) => {
  const user = await requireAuth();

  const { s3Key, force } = await parseJsonObject(request, 4096);

  if (
    typeof s3Key !== "string" ||
    s3Key.length > 1024 ||
    (force !== undefined && typeof force !== "boolean")
  ) {
    throw new ApiError(400, "s3Key is required");
  }

  // enforce that the s3Key belongs to this user's upload prefix (I3)
  const expectedPrefix = `vault-uploads/${user.user_id}/`;
  if (!s3Key.startsWith(expectedPrefix)) {
    throw new ApiError(403, "s3Key does not belong to your upload session");
  }

  const [reservation] = await sql<{ reserved_bytes: string }[]>`
    SELECT reserved_bytes::text FROM app.vault_artifacts
    WHERE user_id = ${user.user_id}::uuid AND kind = 'upload' AND s3_key = ${s3Key}
      AND job_id IS NULL AND is_current AND expires_at > NOW()
  `;
  if (!reservation) throw new ApiError(400, "Upload reservation is missing or expired");

  const bucket = process.env.STORAGE_BUCKET;
  if (!bucket) throw new ApiError(503, "Vault storage is not configured");
  const prefix = process.env.STORAGE_PREFIX || "oghma";
  const s3 = new S3Client({ ...createS3ClientConfig(createS3ConfigFromEnv()) });
  let object;
  try {
    object = await s3.send(
      new HeadObjectCommand({ Bucket: bucket, Key: `${prefix}/${s3Key}` }),
    );
  } catch {
    throw new ApiError(400, "Uploaded zip was not found");
  }
  const expectedSize = Number(object.Metadata?.["expected-size"]);
  if (
    !Number.isSafeInteger(expectedSize) ||
    expectedSize <= 0 ||
    expectedSize > VAULT_UPLOAD_MAX_BYTES ||
    expectedSize !== Number(reservation.reserved_bytes) ||
    object.ContentLength !== expectedSize
  ) {
    throw new ApiError(400, "Uploaded zip size does not match the authorized upload");
  }

  const [existing] = await sql<VaultJobIdRow[]>`
    SELECT id FROM app.canvas_import_jobs
    WHERE user_id = ${user.user_id}
      AND type = 'vault-import'
      AND status IN ('queued', 'processing')
    LIMIT 1
  `;

  if (existing && !force) {
    return NextResponse.json(
      { error: "Import already in progress", activeJobId: existing.id },
      { status: 409 },
    );
  }

  let jobId: string;
  try {
    jobId = await sql.begin(async (tx: postgres.TransactionSql) => {
      await lockVaultArtifacts(tx);
      const [reserved] = await tx`
        SELECT id FROM app.vault_artifacts WHERE user_id = ${user.user_id}::uuid
          AND s3_key = ${s3Key} AND kind = 'upload' AND job_id IS NULL AND is_current AND expires_at > NOW()
        FOR UPDATE
      `;
      if (!reserved) throw new ApiError(409, "Upload has already been claimed or expired");
      if (existing) {
        // also set cancel_requested_at so any running worker stops cooperatively
        await tx`
          UPDATE app.canvas_import_jobs
          SET status = 'cancelled', completed_at = NOW(), cancel_requested_at = NOW(), updated_at = NOW()
          WHERE user_id = ${user.user_id}
            AND type = 'vault-import'
            AND status IN ('queued', 'processing')
        `;
      }
      const [row] = await tx<VaultJobIdRow[]>`
        INSERT INTO app.canvas_import_jobs (user_id, type, input_s3_key, status)
        VALUES (${user.user_id}::uuid, 'vault-import', ${s3Key}, 'queued')
        RETURNING id
      `;
      await tx`UPDATE app.vault_artifacts SET job_id = ${row.id}::uuid WHERE id = ${reserved.id}::uuid`;
      return row.id;
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const [active] = await sql<VaultJobIdRow[]>`
      SELECT id FROM app.canvas_import_jobs
      WHERE user_id = ${user.user_id} AND type = 'vault-import'
        AND status IN ('queued', 'processing')
      LIMIT 1
    `;
    return NextResponse.json(
      { error: "Import already in progress", activeJobId: active?.id },
      { status: 409 },
    );
  }

  try {
    await enqueueCanvasJob("vault-import", {
      jobId,
      userId: user.user_id,
      s3Key,
    }, { attempts: 1 });
  } catch (err) {
    // Enqueue failed. Fail the orphaned job and hand the upload back to its reservation,
    // so the same zip can be started again instead of being locked until it expires.
    await sql.begin(async (tx: postgres.TransactionSql) => {
      await tx`
        UPDATE app.canvas_import_jobs
        SET status = 'failed', error_message = 'Failed to enqueue job', completed_at = NOW(), updated_at = NOW()
        WHERE id = ${jobId}::uuid
      `;
      await tx`
        UPDATE app.vault_artifacts SET job_id = NULL
        WHERE job_id = ${jobId}::uuid AND kind = 'upload'
      `;
    });
    throw err;
  }

  return NextResponse.json({ jobId });
});
