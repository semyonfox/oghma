import { NextResponse } from "next/server";
import { withErrorHandler, requireAuth, ApiError } from "@/lib/api-error";
import sql from "@/database/pgsql";
import {
  findLiveVaultExport,
  signVaultExportDownload,
} from "@/lib/vault/artifacts";
import { expireStaleVaultJobs, isVaultJobType } from "@/lib/vault/jobs";

interface VaultJobStatusRow {
  id: string;
  type: string;
  status: string;
  created_at: Date | string;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  expected_total: number | null;
  processed_files: number | null;
  cancel_requested_at: Date | string | null;
  error_message: string | null;
}

async function signLiveExport(
  userId: string,
  jobId: string,
): Promise<string | undefined> {
  if (!process.env.STORAGE_BUCKET) return undefined;
  const archive = await findLiveVaultExport(userId, jobId);
  if (!archive) return undefined;
  return signVaultExportDownload(archive.s3Key, archive.secondsLeft);
}

/**
 * GET /api/vault/status?type=vault-import|vault-export
 *
 * Returns the most recent vault job status for the current user.
 * For exports, signs a fresh download URL while the archive still exists.
 *
 * Absent values are omitted rather than null: the settings poller validates
 * optional fields as `string | undefined` and drops responses with nulls.
 */
export const GET = withErrorHandler(async (request) => {
  const user = await requireAuth();

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "vault-import";

  if (!isVaultJobType(type)) {
    throw new ApiError(400, "Invalid type");
  }

  // the poll is the one place a user waits on a job, so recover dead ones here
  await expireStaleVaultJobs(user.user_id);

  const [job] = await sql<VaultJobStatusRow[]>`
    SELECT id, type, status, created_at, started_at, completed_at,
           expected_total, processed_files, cancel_requested_at,
           error_message
    FROM app.canvas_import_jobs
    WHERE user_id = ${user.user_id}::uuid
      AND type = ${type}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (!job) {
    return NextResponse.json({});
  }

  const downloadUrl =
    type === "vault-export" && job.status === "complete"
      ? await signLiveExport(user.user_id, job.id)
      : undefined;

  // imports stream the ZIP, so their total is only known once they finish
  let progress;
  if (job.status === "processing" || job.status === "complete") {
    const completed = job.processed_files ?? 0;
    const total = job.expected_total ?? 0;
    progress = {
      completed,
      total,
      ...(total > 0
        ? { percent: Math.min(100, Math.round((completed / total) * 100)) }
        : {}),
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
      error: job.error_message ?? undefined,
    },
    downloadUrl,
    progress,
  });
});
