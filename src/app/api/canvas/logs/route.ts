import { NextResponse } from "next/server";
import { requireAuth, tracedError, withErrorHandler } from "@/lib/api-error";
import sql from "@/database/pgsql";
import logger from "@/lib/logger";

interface CanvasImportLogRow {
  filename: string;
  status: string;
  error_message: string | null;
  mime_type: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface CanvasImportJobRow {
  created_at: Date | string;
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

async function fetchLogs(userId: string, jobStart: Date | string | null) {
  if (jobStart) {
    return sql<CanvasImportLogRow[]>`
      SELECT filename, status, error_message, updated_at, mime_type, created_at
      FROM app.canvas_imports
      WHERE user_id = ${userId} AND created_at >= ${jobStart}
      ORDER BY updated_at DESC LIMIT 1000`;
  }

  return sql<CanvasImportLogRow[]>`
    SELECT filename, status, error_message, updated_at, mime_type, created_at
    FROM app.canvas_imports
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC LIMIT 1000`;
}

export const GET = withErrorHandler(async (request) => {
  const user = await requireAuth();

  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");

    // If a job is provided, verify ownership and get its start time in one query.
    let jobStart: Date | string | null = null;
    if (jobId) {
      const rows = await sql<CanvasImportJobRow[]>`
        SELECT created_at FROM app.canvas_import_jobs
        WHERE id = ${jobId}::uuid AND user_id = ${user.user_id}
      `;
      if (!rows.length) {
        return tracedError("Job not found", 404);
      }
      jobStart = rows[0].created_at;
    }

    const logs = await fetchLogs(user.user_id, jobStart);

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
