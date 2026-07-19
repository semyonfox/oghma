import { NextResponse } from "next/server";
import { withErrorHandler, requireAuth, ApiError } from "@/lib/api-error";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import { createS3ClientConfig, createS3ConfigFromEnv } from "@/lib/storage/s3";

/**
 * POST /api/vault/import
 *
 * Returns a presigned S3 URL for uploading a zip file.
 * Body: { filename: string, contentLength: number }
 * Response: { uploadUrl, s3Key, uploadId }
 */
export const POST = withErrorHandler(async (request) => {
  const user = await requireAuth();

  const { filename, contentLength } = await request.json();

  if (typeof filename !== "string") {
    throw new ApiError(400, "filename is required");
  }
  const normalizedFilename = filename.normalize("NFKC");
  if (
    normalizedFilename.length === 0 || normalizedFilename.length > 255 ||
    normalizedFilename.includes("/") || normalizedFilename.includes("\\") ||
    /[\x00-\x1f\x7f]/.test(normalizedFilename) || normalizedFilename === "." || normalizedFilename === ".." ||
    !normalizedFilename.toLowerCase().endsWith(".zip")
  ) {
    throw new ApiError(400, "Only .zip files are accepted");
  }

  const expectedSize = Number(contentLength);
  if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0) {
    throw new ApiError(400, "contentLength must be a positive integer");
  }
  if (expectedSize > 10 * 1024 * 1024 * 1024) {
    throw new ApiError(400, "File too large (max 10GB)");
  }

  const bucket = process.env.STORAGE_BUCKET;
  if (!bucket) throw new ApiError(503, "Vault storage is not configured");

  const uploadId = uuidv4();
  const prefix = process.env.STORAGE_PREFIX || "oghma";
  const s3Key = `vault-uploads/${user.user_id}/${uploadId}/${normalizedFilename}`;
  const fullKey = `${prefix}/${s3Key}`;

  const s3 = new S3Client({
    ...createS3ClientConfig(createS3ConfigFromEnv()),
    requestChecksumCalculation: "WHEN_REQUIRED",
  });

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: bucket,
      Key: fullKey,
      ContentType: "application/zip",
      ContentLength: expectedSize,
      Metadata: { "expected-size": String(expectedSize) },
    }),
    {
      expiresIn: 900,
      signableHeaders: new Set(["content-type", "x-amz-meta-expected-size"]),
      unhoistableHeaders: new Set(["x-amz-meta-expected-size"]),
    }, // 15 minutes
  );

  return NextResponse.json({ uploadUrl, s3Key, uploadId, contentLength: expectedSize });
});
