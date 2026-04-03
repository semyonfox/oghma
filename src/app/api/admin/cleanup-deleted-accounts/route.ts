import { NextRequest, NextResponse } from "next/server";
import sql from "@/database/pgsql.js";
import logger from "@/lib/logger";
import { performHardAccountDeletion } from "@/lib/auth/account-deletion";

/**
 * POST /api/admin/cleanup-deleted-accounts
 *
 * Permanently deletes accounts whose 30-day grace period has expired.
 * Protected by CRON_SECRET — only callable by the scheduled cron job.
 *
 * Auth: x-cron-secret header (or Authorization: Bearer <secret>) must match
 *       the CRON_SECRET environment variable.
 *
 * Response: { deleted: number; failed: number; errors: string[] }
 *
 * Trigger via Amplify scheduled event or an external cron that POSTs here
 * with the correct secret. Recommended schedule: daily.
 */
export async function POST(request: NextRequest) {
  // authenticate the cron caller
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error("cleanup-deleted-accounts: CRON_SECRET not configured");
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 },
    );
  }

  const providedSecret =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (providedSecret !== cronSecret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // find all accounts whose 30-day grace period has passed
  const expired = await sql`
    SELECT user_id
    FROM app.login
    WHERE deleted_at IS NOT NULL
      AND deleted_at < NOW() - INTERVAL '30 days'
  `;

  if (expired.length === 0) {
    logger.info("cleanup-deleted-accounts: no accounts to purge");
    return NextResponse.json({ deleted: 0, failed: 0, errors: [] });
  }

  let deleted = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of expired) {
    const userId: string = row.user_id;
    try {
      await performHardAccountDeletion(userId);
      deleted++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${userId}: ${message}`);
      logger.error("cleanup-deleted-accounts: failed to delete user", {
        userId,
        error: err,
      });
    }
  }

  logger.info("cleanup-deleted-accounts: purge complete", {
    deleted,
    failed,
    total: expired.length,
  });

  return NextResponse.json({ deleted, failed, errors });
}
