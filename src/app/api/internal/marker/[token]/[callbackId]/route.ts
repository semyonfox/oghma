import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import sql from "@/database/pgsql";
import { enqueueCanvasJob } from "@/lib/queue";

interface RunPodWebhook {
  id?: string;
  status?: string;
  error?: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function tokenMatches(received: string): boolean {
  const expected = process.env.RUNPOD_MARKER_WEBHOOK_TOKEN ?? "";
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return (
    left.length === right.length &&
    left.length > 0 &&
    timingSafeEqual(left, right)
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string; callbackId: string }> },
) {
  const { token, callbackId } = await context.params;
  if (!tokenMatches(token)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!UUID_PATTERN.test(callbackId)) {
    return NextResponse.json({ error: "unknown callback" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as RunPodWebhook | null;
  if (!body?.status) {
    return NextResponse.json({ error: "invalid webhook" }, { status: 400 });
  }
  const [job] = await sql`
    SELECT * FROM app.marker_jobs WHERE callback_id = ${callbackId}::uuid LIMIT 1
  `;
  if (!job) {
    return NextResponse.json({ error: "unknown callback" }, { status: 404 });
  }
  if (job.runpod_job_id && body.id && job.runpod_job_id !== body.id) {
    return NextResponse.json({ error: "job mismatch" }, { status: 409 });
  }

  const data = {
    noteId: job.note_id,
    userId: job.user_id,
    jobId: job.canvas_job_id,
    filename: job.filename,
    mimeType: job.mime_type,
    parentFolderId: job.parent_folder_id,
    resultKey: job.result_key,
    runpodJobId: body.id ?? job.runpod_job_id,
    error: body.error ?? null,
  };
  const completed = body.status.toUpperCase() === "COMPLETED";
  await enqueueCanvasJob(
    completed ? "marker-complete" : "marker-failed",
    data,
    {
      jobId: `marker-${callbackId}`,
      attempts: 3,
    },
  );
  await sql`
    UPDATE app.marker_jobs
    SET status = ${body.status.toLowerCase()}, error = ${body.error ?? null},
        completed_at = CASE WHEN ${completed} THEN NOW() ELSE completed_at END,
        updated_at = NOW()
    WHERE callback_id = ${callbackId}::uuid
  `;
  return NextResponse.json({ accepted: true });
}
