import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth.js";
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
export async function POST(request: Request) {
  try {
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { filename, contentLength } = await request.json();

    if (!filename?.endsWith(".zip")) {
      return NextResponse.json(
        { error: "Only .zip files are accepted" },
        { status: 400 },
      );
    }

    // 10GB max
    if (contentLength && contentLength > 10 * 1024 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large (max 10GB)" },
        { status: 400 },
      );
    }

    const uploadId = uuidv4();
    const bucket = process.env.STORAGE_BUCKET;
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
  } catch (err) {
    console.error("vault import presign error:", err);
    return NextResponse.json(
      { error: "Failed to generate upload URL" },
      { status: 500 },
    );
  }
}
