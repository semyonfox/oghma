import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth.js";
import sql from "@/database/pgsql.js";
import { sqsClient, getCanvasImportQueueUrl } from "@/lib/sqs";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { ensureWorkerRunning } from "@/lib/ecs";

/**
 * POST /api/vault/export
 *
 * Creates a vault-export job and dispatches to SQS.
 * Response: { jobId }
 */
export async function POST() {
  try {
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // cancel any existing active export jobs
    const job = await sql.begin(async (tx: any) => {
      await tx`
        UPDATE app.canvas_import_jobs
        SET status = 'cancelled', completed_at = NOW()
        WHERE user_id = ${user.user_id}
          AND type = 'vault-export'
          AND status IN ('queued', 'processing')
      `;
      const [inserted] = await tx`
        INSERT INTO app.canvas_import_jobs (user_id, type, status)
        VALUES (${user.user_id}::uuid, 'vault-export', 'queued')
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
              type: "vault-export",
              jobId,
              userId: user.user_id,
            }),
          }),
        );
      }
    } catch (sqsErr) {
      console.error(
        "SQS send failed for vault export:",
        (sqsErr as Error).message,
      );
    }

    try {
      await ensureWorkerRunning();
    } catch (ecsErr) {
      console.error(
        "ECS scale-up failed for vault export:",
        (ecsErr as Error).message,
      );
    }

    return NextResponse.json({ jobId });
  } catch (err) {
    console.error("vault export error:", err);
    return NextResponse.json(
      { error: "Failed to start export" },
      { status: 500 },
    );
  }
}
