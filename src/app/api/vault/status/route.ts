import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth.js";
import sql from "@/database/pgsql.js";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * GET /api/vault/status?type=vault-import|vault-export
 *
 * Returns the most recent vault job status for the current user.
 * For exports, regenerates the presigned download URL if expired.
 */
export async function GET(request: Request) {
  try {
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "vault-import";

    if (!["vault-import", "vault-export"].includes(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    const [job] = await sql`
      SELECT id, type, status, created_at, started_at, completed_at,
             expected_total, error_message, output_s3_key, download_url
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
        region: process.env.STORAGE_REGION || "us-east-1",
      });

      downloadUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: bucket, Key: fullKey }),
        { expiresIn: 86400 },
      );
    }

    // for imports, count processed files for progress
    let progress = null;
    if (
      type === "vault-import" &&
      ["processing", "complete"].includes(job.status)
    ) {
      const [counts] = await sql`
        SELECT COUNT(*) as total
        FROM app.notes
        WHERE user_id = ${user.user_id}
          AND created_at >= ${job.created_at}
          AND is_folder = false
          AND deleted = 0
      `;
      const completed = parseInt(counts?.total ?? "0", 10);
      const total = job.expected_total ?? 0;
      progress = {
        completed,
        total,
        percent:
          total > 0
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
        error: job.error_message,
      },
      downloadUrl,
      progress,
    });
  } catch (err) {
    console.error("vault status error:", err);
    return NextResponse.json(
      { error: "Failed to fetch status" },
      { status: 500 },
    );
  }
}
