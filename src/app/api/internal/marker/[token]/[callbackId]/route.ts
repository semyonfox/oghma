import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import sql from "@/database/pgsql";
import {
  enqueueMarkerCompletionJob,
  enqueueMarkerFailureJob,
} from "@/lib/queue";
import { summarizeRunPodJobStatus } from "@/lib/runpod-serverless";

interface RunPodWebhook {
  id?: string;
  status?: string;
  error?: string;
  delayTime?: unknown;
  executionTime?: unknown;
  workerId?: unknown;
  output?: unknown;
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

function providerError(value: unknown, fallback: string | null = null): string | null {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value.replace(/https?:\/\/\S+/gi, "[redacted-url]").slice(0, 1_000);
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
  const summary = summarizeRunPodJobStatus(body);
  if (!summary.status || (body.id && !summary.id)) {
    return NextResponse.json({ error: "invalid webhook" }, { status: 400 });
  }
  const [job] = await sql`
    SELECT * FROM app.marker_jobs WHERE callback_id = ${callbackId}::uuid LIMIT 1
  `;
  if (!job) {
    return NextResponse.json({ error: "unknown callback" }, { status: 404 });
  }
  if (job.provider && job.provider !== "runpod") {
    return NextResponse.json({ error: "provider mismatch" }, { status: 409 });
  }
  const expectedJobId = job.provider_job_id ?? job.runpod_job_id;
  if (expectedJobId && expectedJobId !== summary.id) {
    return NextResponse.json({ error: "job mismatch" }, { status: 409 });
  }

  const status = summary.status;
  const completed = status === "COMPLETED";
  if (!["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"].includes(status)) {
    // RunPod may issue informational statuses before a terminal webhook. Do
    // not let one move an Oghma-owned job state.
    await sql`
      UPDATE app.marker_jobs
      SET provider_metrics = COALESCE(provider_metrics, '{}'::jsonb)
          || ${JSON.stringify(summary.metrics)}::jsonb
      WHERE callback_id = ${callbackId}::uuid
        AND status NOT IN ('completed', 'failed', 'invalid_result', 'cancelled')
    `;
    return NextResponse.json({ accepted: true, terminal: false });
  }

  const error = completed
    ? null
    : providerError(
      body.error,
      `RunPod job ${summary.id ?? expectedJobId ?? "unknown"} ${status.toLowerCase()}`,
    );

  const transitioned = await sql`
    UPDATE app.marker_jobs
    SET status = ${completed ? "completion_queued" : "failure_queued"},
        provider_job_id = COALESCE(${summary.id ?? null}, provider_job_id),
        runpod_job_id = COALESCE(${summary.id ?? null}, runpod_job_id),
        provider_metrics = COALESCE(provider_metrics, '{}'::jsonb)
            || ${JSON.stringify(summary.metrics)}::jsonb,
        error = ${error},
        updated_at = NOW()
    WHERE callback_id = ${callbackId}::uuid
      AND status NOT IN ('completed', 'failed', 'invalid_result', 'cancelled')
    RETURNING callback_id
  `;
  if (transitioned.length === 0) {
    return NextResponse.json({ accepted: true, cancelled: job.status === "cancelled" });
  }
  try {
    if (completed) {
      await enqueueMarkerCompletionJob(callbackId);
    } else {
      await enqueueMarkerFailureJob(callbackId);
    }
  } catch (error) {
    const message = providerError(
      error instanceof Error ? error.message : String(error),
      "Marker continuation queue is unavailable",
    );
    await sql`
      UPDATE app.marker_jobs
      SET status = ${
        completed ? "completion_enqueue_failed" : "failure_enqueue_failed"
      }, error = ${message}, updated_at = NOW()
      WHERE callback_id = ${callbackId}::uuid
        AND status IN ('completion_queued', 'failure_queued')
    `;
    return NextResponse.json({ error: "queue unavailable" }, { status: 503 });
  }
  return NextResponse.json({ accepted: true });
}
