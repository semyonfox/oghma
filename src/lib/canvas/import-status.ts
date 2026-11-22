import { withCanvasPublication } from "./execution";

import sql from "../../database/pgsql";

import { createAsyncLimiter } from "./async-limiter";
import { findOrCreateNote } from "./import-notes";
import { parseEnvConcurrency } from "./import-metrics";
import { processRagPipeline, type RagPipelineOptions, type RagPipelineResult } from "./import-embedding";

// shared by every import stage: the file timeout and limiter, status writes and cancellation

interface ImportStatusExtra {
  noteId?: string;
  message?: string | null;
}

export const FILE_TIMEOUT_MS = Math.max(
  60_000,
  Number.parseInt(process.env.CANVAS_FILE_TIMEOUT_MS ?? "", 10) ||
    10 * 60 * 1000,
);
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

const CANVAS_GLOBAL_FILE_CONCURRENCY = parseEnvConcurrency(
  "CANVAS_GLOBAL_FILE_CONCURRENCY",
  6,
);

export const globalFileLimiter = createAsyncLimiter(CANVAS_GLOBAL_FILE_CONCURRENCY);

// ── Note helpers ────────────────────────────────────────────────────────────

// ── Import record helpers ───────────────────────────────────────────────────

export async function setImportStatus(
  importRecordId: string,
  status: string,
  extra: ImportStatusExtra = {},
  expectedJobId: string | null = null,
) {
  return withCanvasPublication(async () => {
  // Every worker-side transition is scoped to the import generation that
  // claimed it. A delayed queue message may observe the same row after a
  // newer import has reused it; it must then become a no-op rather than
  // overwrite that newer generation.
  if (extra.noteId) {
    await sql`
      UPDATE app.canvas_imports
      SET status = ${status}, note_id = ${extra.noteId}::uuid, updated_at = NOW()
      WHERE id = ${importRecordId}::uuid
        AND (${expectedJobId ?? null}::uuid IS NULL OR job_id = ${expectedJobId ?? null}::uuid)
        AND status NOT IN ('cancelled', 'complete', 'forbidden', 'error')
    `;
  } else if (extra.message !== undefined) {
    await sql`
      UPDATE app.canvas_imports
      SET status = ${status}, error_message = ${extra.message}, updated_at = NOW()
      WHERE id = ${importRecordId}::uuid
        AND (${expectedJobId ?? null}::uuid IS NULL OR job_id = ${expectedJobId ?? null}::uuid)
        AND status NOT IN ('cancelled', 'complete', 'forbidden', 'error')
    `;
  } else {
    await sql`
      UPDATE app.canvas_imports
      SET status = ${status}, updated_at = NOW()
      WHERE id = ${importRecordId}::uuid
        AND (${expectedJobId ?? null}::uuid IS NULL OR job_id = ${expectedJobId ?? null}::uuid)
        AND status NOT IN ('cancelled', 'complete', 'forbidden', 'error')
    `;
  }

  });
}

export async function isJobCancelled(jobId?: string | null) {
  if (!jobId) return false;
  const [row] =
    await sql`SELECT status FROM app.canvas_import_jobs WHERE id = ${jobId} LIMIT 1`;
  return row?.status === "cancelled";
}

// ── RAG pipeline wrapper ────────────────────────────────────────────────────
// wraps processRagPipeline to inject findOrCreateNote (avoids circular deps)

export async function runRagPipeline(
  noteId: string,
  userId: string,
  parentFolderId: string | null,
  buffer: Buffer,
  ragOpts: RagPipelineOptions,
): Promise<RagPipelineResult | null> {
  return processRagPipeline(
    noteId,
    userId,
    parentFolderId,
    buffer,
    ragOpts,
    findOrCreateNote,
  );
}
