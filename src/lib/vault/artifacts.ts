import sql from "@/database/pgsql";
import type postgres from "postgres";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getStorageProvider } from "@/lib/storage/init";
import { createS3ClientConfig, createS3ConfigFromEnv } from "@/lib/storage/s3";
import { ApiError } from "@/lib/api-errors";

export const VAULT_UPLOAD_MAX_BYTES = 10 * 1024 ** 3;
const GLOBAL_STAGING_MAX_BYTES = 20 * 1024 ** 3;
// matches the INTERVAL '24 hours' an export artifact lives after completion
export const VAULT_EXPORT_DOWNLOAD_SECONDS = 24 * 60 * 60;

export function vaultExportKey(userId: string, jobId: string): string {
  return `exports/${userId}/${jobId}/vault-export.zip`;
}

export const VAULT_EXPORT_DOWNLOAD_NAME = "oghmanotes-vault.zip";

/** Bucket and full object key for a vault path, for the direct multipart and signing clients. */
export function vaultStorageLocation(path: string): { bucket: string; key: string } {
  const config = createS3ConfigFromEnv();
  return { bucket: config.bucket, key: `${config.prefix || "oghma"}/${path}` };
}

export async function signVaultExportDownload(path: string, expiresIn: number): Promise<string> {
  const { bucket, key } = vaultStorageLocation(path);
  const s3 = new S3Client(createS3ClientConfig(createS3ConfigFromEnv()));
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${VAULT_EXPORT_DOWNLOAD_NAME}"`,
    }),
    { expiresIn },
  );
}

/**
 * The archive behind a completed export, if retention has not removed it yet.
 * Links are never signed past the artifact's own expiry.
 */
export async function findLiveVaultExport(
  userId: string,
  jobId: string,
): Promise<{ s3Key: string; secondsLeft: number } | null> {
  const [artifact] = await sql<{ s3_key: string; seconds_left: number }[]>`
    SELECT s3_key, FLOOR(EXTRACT(EPOCH FROM expires_at - NOW()))::int AS seconds_left
    FROM app.vault_artifacts
    WHERE user_id = ${userId}::uuid AND job_id = ${jobId}::uuid
      AND kind = 'export' AND expires_at > NOW()
  `;
  if (!artifact || artifact.seconds_left < 1) return null;
  return {
    s3Key: artifact.s3_key,
    secondsLeft: Math.min(artifact.seconds_left, VAULT_EXPORT_DOWNLOAD_SECONDS),
  };
}

export async function lockVaultArtifacts(tx: postgres.TransactionSql) {
  await tx`SELECT pg_advisory_xact_lock(hashtextextended('vault-artifact-quota', 4))`;
}

// reservations outlive signed URLs so replayed PUTs cannot escape accounting
export async function reserveVaultUpload(
  userId: string,
  s3Key: string,
  size: number,
): Promise<string> {
  return sql.begin(async (tx) => {
    await lockVaultArtifacts(tx);
    const [current] = await tx<
      {
        id: string;
        s3_key: string;
        reserved_bytes: string;
        job_id: string | null;
        reusable: boolean;
      }[]
    >`
      SELECT a.id, a.s3_key, a.reserved_bytes::text, a.job_id, a.expires_at > NOW() AS reusable
      FROM app.vault_artifacts a
      WHERE a.user_id = ${userId}::uuid AND a.kind = 'upload' AND a.is_current FOR UPDATE OF a
    `;
    if (
      current &&
      current.reusable &&
      !current.job_id &&
      Number(current.reserved_bytes) === size &&
      current.s3_key.split("/").at(-1) === s3Key.split("/").at(-1)
    ) {
      // failed PUT/signing retries reuse one key and byte reservation
      await tx`UPDATE app.vault_artifacts SET expires_at = NOW() + INTERVAL '2 hours' WHERE id = ${current.id}::uuid`;
      return current.s3_key;
    }
    const [usage] = await tx<{ total: string; owned: number }[]>`
      SELECT COALESCE(SUM(reserved_bytes), 0)::text AS total,
        COUNT(*) FILTER (WHERE user_id = ${userId}::uuid)::int AS owned
      FROM app.vault_artifacts WHERE kind = 'upload'
    `;
    if (usage.owned >= 100)
      throw new ApiError(
        429,
        "Too many recent uploads. Please wait for cleanup.",
      );
    if (Number(usage.total) + size > GLOBAL_STAGING_MAX_BYTES)
      throw new ApiError(429, "Vault staging is busy. Please try again later.");
    if (current)
      await tx`UPDATE app.vault_artifacts SET is_current = false WHERE id = ${current.id}::uuid`;
    await tx`
      INSERT INTO app.vault_artifacts (user_id, kind, s3_key, reserved_bytes, expires_at)
      VALUES (${userId}::uuid, 'upload', ${s3Key}, ${size}, NOW() + INTERVAL '2 hours')
    `;
    return s3Key;
  });
}

export async function lockVaultExport(
  tx: postgres.TransactionSql,
  userId: string,
) {
  await tx`SELECT pg_advisory_xact_lock(hashtextextended(${userId + ":vault-export"}, 4))`;
}

export async function reserveVaultExport(
  tx: postgres.TransactionSql,
  userId: string,
  jobId: string,
) {
  await lockVaultExport(tx, userId);
  // remove prior completed archives under the same quota lock, before reserving a replacement
  const old = await tx<{ id: string; s3_key: string; status: string | null }[]>`
    SELECT a.id, a.s3_key, j.status FROM app.vault_artifacts a
    LEFT JOIN app.canvas_import_jobs j ON j.id = a.job_id
    WHERE a.user_id = ${userId}::uuid AND a.kind = 'export' FOR UPDATE OF a
  `;
  if (
    old.some((row) => row.status === "queued" || row.status === "processing")
  ) {
    throw new ApiError(409, "The previous export is still finishing");
  }
  for (const row of old) {
    await getStorageProvider().deleteObject(
      row.s3_key,
      AbortSignal.timeout(30_000),
    );
    await tx`DELETE FROM app.vault_artifacts WHERE id = ${row.id}::uuid`;
  }
  await tx`
    INSERT INTO app.vault_artifacts (user_id, kind, s3_key, job_id, reserved_bytes, expires_at)
    VALUES (${userId}::uuid, 'export', ${vaultExportKey(userId, jobId)}, ${jobId}::uuid, 0, NOW() + INTERVAL '24 hours')
  `;
}

export async function cleanupVaultArtifacts(): Promise<number> {
  let removed = 0;
  const rows = await sql<{ id: string }[]>`
    SELECT a.id FROM app.vault_artifacts a
    LEFT JOIN app.canvas_import_jobs j ON j.id = a.job_id
    WHERE a.expires_at <= NOW() AND (j.id IS NULL OR j.status NOT IN ('queued', 'processing'))
    ORDER BY a.expires_at LIMIT 100
  `;
  let firstError: unknown;
  for (const row of rows) {
    try {
      const deleted = await sql.begin(async (tx) => {
        const [owner] = await tx<
          { user_id: string; kind: string }[]
        >`SELECT user_id, kind FROM app.vault_artifacts WHERE id = ${row.id}::uuid`;
        if (!owner) return false;
        if (owner.kind === "export") await lockVaultExport(tx, owner.user_id);
        else await lockVaultArtifacts(tx);
        const [artifact] = await tx<
          { id: string; s3_key: string; job_id: string | null }[]
        >`
          SELECT id, s3_key, job_id FROM app.vault_artifacts
          WHERE id = ${row.id}::uuid AND expires_at <= NOW() FOR UPDATE
        `;
        if (!artifact) return false;
        if (artifact.job_id) {
          const [job] = await tx<{ status: string }[]>`
            SELECT status FROM app.canvas_import_jobs WHERE id = ${artifact.job_id}::uuid FOR UPDATE
          `;
          if (job?.status === "queued" || job?.status === "processing")
            return false;
        }
        // a failed delete leaves the reservation intact for the next worker sweep
        await getStorageProvider().deleteObject(
          artifact.s3_key,
          AbortSignal.timeout(30_000),
        );
        await tx`DELETE FROM app.vault_artifacts WHERE id = ${artifact.id}::uuid`;
        if (artifact.job_id && owner.kind === "export") {
          // the job row outlives its archive; stop it advertising a dead download
          await tx`
            UPDATE app.canvas_import_jobs SET output_s3_key = NULL, download_url = NULL
            WHERE id = ${artifact.job_id}::uuid
          `;
        }
        return true;
      });
      if (deleted) removed++;
    } catch (error) {
      firstError ??= error;
    }
  }
  if (firstError !== undefined) throw firstError;
  return removed;
}
