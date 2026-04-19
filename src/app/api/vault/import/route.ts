import { NextResponse } from "next/server";
import { withErrorHandler, requireAuth, ApiError } from "@/lib/api-error";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";

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

  if (!filename?.endsWith(".zip")) {
    throw new ApiError(400, "Only .zip files are accepted");
  }

  // 10GB max
  if (contentLength && contentLength > 10 * 1024 * 1024 * 1024) {
    throw new ApiError(400, "File too large (max 10GB)");
  }

  const bucket = process.env.STORAGE_BUCKET;
  if (!bucket) throw new ApiError(503, "Vault storage is not configured");

  const uploadId = uuidv4();
  const prefix = process.env.STORAGE_PREFIX || "oghma";
  const s3Key = `vault-uploads/${user.user_id}/${uploadId}/${filename}`;
  const fullKey = `${prefix}/${s3Key}`;

  const s3 = new S3Client({
    region: process.env.STORAGE_REGION || "us-east-1",
  });

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: bucket,
      Key: fullKey,
      ContentType: "application/zip",
    }),
    { expiresIn: 900 }, // 15 minutes
  );

  return NextResponse.json({ uploadUrl, s3Key, uploadId });
});
