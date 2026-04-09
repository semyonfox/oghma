import { NextResponse } from "next/server";
import { withErrorHandler, requireAuth, ApiError } from "@/lib/api-error";
import sql from "@/database/pgsql.js";
import { sqsClient, getCanvasImportQueueUrl } from "@/lib/sqs";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { ensureWorkerRunning } from "@/lib/ecs";

/**
 * POST /api/vault/import/start
 *
 * Creates a vault-import job after the zip has been uploaded to S3.
 * Body: { s3Key: string }
 * Response: { jobId }
 */
export const POST = withErrorHandler(async (request) => {
  const user = await requireAuth();

  const { s3Key } = await request.json();

  if (!s3Key) {
    throw new ApiError(400, "s3Key is required");
  }

  // enforce that the s3Key belongs to this user's upload prefix (I3)
  const expectedPrefix = `vault-uploads/${user.user_id}/`;
  if (!s3Key.startsWith(expectedPrefix)) {
    throw new ApiError(403, "s3Key does not belong to your upload session");
  }

  // cancel any existing active vault jobs for this user
  const job = await sql.begin(async (tx: any) => {
    await tx`
      UPDATE app.canvas_import_jobs
      SET status = 'cancelled', completed_at = NOW()
      WHERE user_id = ${user.user_id}
        AND type = 'vault-import'
        AND status IN ('queued', 'processing')
    `;
    const [inserted] = await tx`
      INSERT INTO app.canvas_import_jobs (user_id, type, input_s3_key, status)
      VALUES (${user.user_id}::uuid, 'vault-import', ${s3Key}, 'queued')
      RETURNING id
    `;
    return inserted;
  });

  const jobId = job.id;

  // dispatch to SQS
  const queueUrl = getCanvasImportQueueUrl();
  try {
    if (queueUrl) {
      await sqsClient.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify({
            type: "vault-import",
            jobId,
            userId: user.user_id,
            s3Key,
          }),
        }),
      );
    }
  } catch (sqsErr) {
    console.error(
      "SQS send failed for vault import:",
      (sqsErr as Error).message,
    );
  }

  // scale up worker
  try {
    await ensureWorkerRunning();
  } catch (ecsErr) {
    console.error(
      "ECS scale-up failed for vault import:",
      (ecsErr as Error).message,
    );
  }

  return NextResponse.json({ jobId });
});
