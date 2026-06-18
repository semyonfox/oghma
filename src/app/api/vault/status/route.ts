import { NextResponse } from "next/server";
import { withErrorHandler, requireAuth, ApiError } from "@/lib/api-error";
import sql from "@/database/pgsql.js";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createS3ClientConfig, createS3ConfigFromEnv } from "@/lib/storage/s3";

/**
 * GET /api/vault/status?type=vault-import|vault-export
 *
 * Returns the most recent vault job status for the current user.
 * For exports, regenerates the presigned download URL if expired.
 */
export const GET = withErrorHandler(async (request) => {
  const user = await requireAuth();

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "vault-import";

  if (!["vault-import", "vault-export"].includes(type)) {
    throw new ApiError(400, "Invalid type");
  }

  const [job] = await sql`
    SELECT id, type, status, created_at, started_at, completed_at,
           expected_total, processed_files, cancel_requested_at,
           error_message, output_s3_key, download_url
    FROM app.canvas_import_jobs
    WHERE user_id = ${user.user_id}
      AND type = ${type}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (!job) {
    return NextResponse.json({ job: null, downloadUrl: null });
  }

  let downloadUrl = null;
  if (
    type === "vault-export" &&
    job.status === "complete" &&
    job.output_s3_key
  ) {
    // regenerate presigned URL (previous one may have expired)
    const bucket = process.env.STORAGE_BUCKET;
    const prefix = process.env.STORAGE_PREFIX || "oghma";
    const fullKey = `${prefix}/${job.output_s3_key}`;
    const s3 = new S3Client({
      ...createS3ClientConfig(createS3ConfigFromEnv()),
    });

    downloadUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: bucket, Key: fullKey }),
      { expiresIn: 86400 },
    );
  }

  // unified progress for both import and export
  let progress = null;
  if (["processing", "complete"].includes(job.status)) {
    const completed = job.processed_files ?? 0;
    const total = job.expected_total ?? 0;
    progress = {
      completed,
      total,
      percent: total > 0
        ? Math.min(100, Math.round((completed / total) * 100))
        : null,
    };
  }

  return NextResponse.json({
    job: {
      jobId: job.id,
      type: job.type,
      status: job.status,
      createdAt: job.created_at,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      expectedTotal: job.expected_total,
      cancelRequested: !!job.cancel_requested_at,
      error: job.error_message,
    },
    downloadUrl,
    progress,
  });
});
