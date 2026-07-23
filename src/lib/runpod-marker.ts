import { randomUUID } from "node:crypto";

import sql from "@/database/pgsql";
import type { StoreS3 } from "@/lib/storage/s3";

function positiveInt(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function enabled(value: string | undefined): boolean {
  return ["1", "true", "on", "yes"].includes(value?.trim().toLowerCase() ?? "");
}

export function markerQueueEnabled(): boolean {
  return Boolean(
    enabled(process.env.MARKER_OCR_ENABLED) &&
    process.env.RUNPOD_MARKER_ENDPOINT_ID?.trim() &&
    process.env.RUNPOD_API_KEY?.trim() &&
    process.env.RUNPOD_MARKER_WEBHOOK_TOKEN?.trim() &&
    process.env.STORAGE_PUBLIC_ENDPOINT?.trim(),
  );
}

export function processAllPdfsWithMarker(): boolean {
  return enabled(process.env.MARKER_PROCESS_ALL_PDFS);
}

export interface SubmitMarkerJobInput {
  storage: StoreS3;
  sourceKey: string;
  noteId: string;
  userId: string;
  jobId?: string | null;
  filename: string;
  mimeType?: string | null;
  parentFolderId?: string | null;
}

export interface SubmittedMarkerJob {
  runpodJobId: string;
  resultKey: string;
}

export async function submitMarkerJob({
  storage,
  sourceKey,
  noteId,
  userId,
  jobId,
  filename,
  mimeType,
  parentFolderId,
}: SubmitMarkerJobInput): Promise<SubmittedMarkerJob> {
  if (!markerQueueEnabled()) {
    throw new Error(
      "RunPod Marker queue is incomplete; set endpoint, API key, webhook token, and STORAGE_PUBLIC_ENDPOINT",
    );
  }

  const endpointId = process.env.RUNPOD_MARKER_ENDPOINT_ID!.trim();
  const apiKey = process.env.RUNPOD_API_KEY!.trim();
  const token = process.env.RUNPOD_MARKER_WEBHOOK_TOKEN!.trim();
  const appUrl = (
    process.env.RUNPOD_MARKER_WEBHOOK_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_BASE_URL ??
    ""
  ).replace(/\/$/, "");
  if (!appUrl.startsWith("https://")) {
    throw new Error("RunPod Marker webhook base URL must be public HTTPS");
  }

  const ttlSeconds = positiveInt("RUNPOD_MARKER_JOB_TTL_SECONDS", 43_200);
  const executionTimeoutMs = positiveInt(
    "RUNPOD_MARKER_EXECUTION_TIMEOUT_MS",
    30 * 60 * 1000,
  );
  const resultKey = `marker-results/${noteId}/${randomUUID()}.json`;
  const callbackId = randomUUID();
  const [sourceUrl, resultUrl] = await Promise.all([
    storage.getExternalSignUrl(sourceKey, ttlSeconds),
    storage.getPutSignUrl(resultKey, ttlSeconds, "application/json"),
  ]);

  await sql`
    INSERT INTO app.marker_jobs (
      callback_id, note_id, user_id, canvas_job_id, filename, mime_type,
      parent_folder_id, source_key, result_key, status
    ) VALUES (
      ${callbackId}::uuid, ${noteId}::uuid, ${userId}::uuid,
      ${jobId ?? null}::uuid, ${filename}, ${mimeType ?? "application/octet-stream"},
      ${parentFolderId ?? null}::uuid, ${sourceKey}, ${resultKey}, 'submitting'
    )
  `;

  let response: Response;
  try {
    response = await fetch(`https://api.runpod.ai/v2/${endpointId}/run`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        input: {
          sourceUrl,
          resultUrl,
          resultKey,
          noteId,
          userId,
          jobId: jobId ?? null,
          filename,
          mimeType: mimeType ?? "application/octet-stream",
          parentFolderId: parentFolderId ?? null,
          options: {
            outputFormat: "markdown",
            mode: process.env.MARKER_MODE ?? "balanced",
            pageRange: process.env.MARKER_PAGE_RANGE?.trim() || null,
            ocrFallbackPolicy: process.env.MARKER_OCR_FALLBACK_POLICY ?? "auto",
            tableOcrPolicy: process.env.MARKER_TABLE_OCR_POLICY ?? "auto",
          },
        },
        webhook: `${appUrl}/api/internal/marker/${token}/${callbackId}`,
        policy: {
          executionTimeout: executionTimeoutMs,
          ttl: ttlSeconds * 1000,
        },
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "network error";
    await sql`
      UPDATE app.marker_jobs
      SET status = 'submission_failed', error = ${message}, updated_at = NOW()
      WHERE callback_id = ${callbackId}::uuid
    `;
    throw new Error(`RunPod Marker submission failed: ${message}`, {
      cause: error,
    });
  }

  const payload = (await response.json().catch(() => ({}))) as {
    id?: string;
    error?: string;
  };
  if (!response.ok || !payload.id) {
    await sql`
      UPDATE app.marker_jobs
      SET status = 'submission_failed', error = ${payload.error ?? response.statusText}, updated_at = NOW()
      WHERE callback_id = ${callbackId}::uuid
    `;
    throw new Error(
      `RunPod Marker submission failed (${response.status}): ${payload.error ?? response.statusText}`,
    );
  }
  await sql`
    UPDATE app.marker_jobs
    SET runpod_job_id = ${payload.id}, status = 'queued', updated_at = NOW()
    WHERE callback_id = ${callbackId}::uuid
  `;
  return { runpodJobId: payload.id, resultKey };
}
