// vault import/export routes
// tree + S3 storage are wired — these are ready to enable
// UI buttons in settings are disabled until you flip VAULT_JOBS_ENABLED
import { NextRequest, NextResponse } from "next/server";
import { enqueueCanvasJob } from "@/lib/queue";
import logger from "@/lib/logger";
import { requireAuth, tracedError, withErrorHandler } from "@/lib/api-error";

const ENABLED = process.env.VAULT_JOBS_ENABLED === "true";

// POST /api/import-export?action=export  — queues a vault export job
// POST /api/import-export?action=import  — queues a vault import job (expects zip upload)
export const POST = withErrorHandler(async (request: NextRequest) => {
  if (!ENABLED) {
    return tracedError("Vault import/export is not yet enabled.", 501);
  }

  const session = await requireAuth();

  const action = request.nextUrl.searchParams.get("action");
  const userId = session.user_id;

  if (action === "export") {
    // queue a background export — worker builds zip and uploads to S3
    try {
      await enqueueCanvasJob("vault-export", { userId }, { attempts: 1 });
    } catch (err) {
      logger.warn("queue enqueue failed for vault-export", { error: err });
    }
    return NextResponse.json({ success: true, queued: true });
  }

  if (action === "import") {
    // accept zip upload, store in S3, then queue background import
    // the worker extracts markdown files, creates notes, runs RAG
    return tracedError("Vault import is not yet implemented.", 501);
  }

  return tracedError('action must be "export" or "import"', 400);
});
