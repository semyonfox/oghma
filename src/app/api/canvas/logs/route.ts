import { NextResponse } from "next/server";
import { requireAuth, tracedError, withErrorHandler } from "@/lib/api-error";
import sql from "@/database/pgsql";
import logger from "@/lib/logger";
import { isValidUUID } from "@/lib/utils/uuid";

interface CanvasImportLogRow {
  filename: string;
  status: string;
  error_message: string | null;
  mime_type: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function formatLog(row: CanvasImportLogRow) {
  return {
    filename: row.filename,
    status: row.status,
    errorMessage: row.error_message,
    mimeType: row.mime_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// File rows are reused across imports and moved to a retry run, so their
// created_at says nothing about which job they belong to. Filter by job_id.
async function fetchLogs(userId: string, jobId: string | null) {
  if (jobId) {
    return sql<CanvasImportLogRow[]>`
      SELECT filename, status, error_message, updated_at, mime_type, created_at
      FROM app.canvas_imports
      WHERE user_id = ${userId}::uuid AND job_id = ${jobId}::uuid
      ORDER BY updated_at DESC LIMIT 1000`;
  }

  return sql<CanvasImportLogRow[]>`
    SELECT filename, status, error_message, updated_at, mime_type, created_at
    FROM app.canvas_imports
    WHERE user_id = ${userId}::uuid
    ORDER BY updated_at DESC LIMIT 1000`;
}

export const GET = withErrorHandler(async (request) => {
  const user = await requireAuth();

  const jobId = new URL(request.url).searchParams.get("jobId");
  if (jobId !== null && !isValidUUID(jobId)) {
    return tracedError("Invalid import ID", 400);
  }

  try {
    if (jobId) {
      const [job] = await sql<{ id: string }[]>`
        SELECT id FROM app.canvas_import_jobs
        WHERE id = ${jobId}::uuid AND user_id = ${user.user_id}::uuid
      `;
      if (!job) {
        return tracedError("Job not found", 404);
      }
    }

    const logs = await fetchLogs(user.user_id, jobId);

    return NextResponse.json({
      success: true,
      jobId: jobId ?? null,
      count: logs.length,
      logs: logs.map(formatLog),
    });
  } catch (error) {
    logger.error("canvas logs error", { error });
    return tracedError("Failed to fetch logs", 500);
  }
});
