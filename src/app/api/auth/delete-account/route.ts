import { NextResponse } from "next/server";
import {
  withErrorHandler,
  requireAuth,
  ApiError,
  parseJsonObject,
} from "@/lib/api-error";
import { clearSessionCookies } from "@/lib/auth/session";
import sql from "@/database/pgsql";
import { DELETED_ACCOUNT_GRACE_DAYS } from "@/lib/auth/account-purge";
import { cancelUserJobs } from "@/lib/auth/cancel-user-jobs";

const CONFIRM_PHRASE = "delete my account";

/**
 * DELETE /api/auth/delete-account
 *
 * Deactivates the account and keeps its data for a support-led recovery window.
 * Every credential that could reach the account or act for it is revoked here:
 * sessions (session_version), the calendar feed, pending reset and verification
 * links, and the stored Canvas token. Queued Canvas imports and study-map jobs
 * are cancelled in the same transaction so nothing keeps running for the account.
 *
 * The import worker purges rows once deleted_at is older than
 * DELETED_ACCOUNT_GRACE_DAYS (see lib/auth/account-purge.ts). Until then the
 * account can be recovered by contacting support, and its email stays taken.
 */
export const DELETE = withErrorHandler(async (request) => {
  const user = await requireAuth();

  const body = await parseJsonObject(request, 1024);
  if (body.confirmation !== CONFIRM_PHRASE) {
    throw new ApiError(400, `Confirmation phrase must be exactly: "${CONFIRM_PHRASE}"`);
  }

  await sql.begin(async (tx) => {
    await tx`
      UPDATE app.login
      SET
        is_active = false,
        deleted_at = now(),
        session_version = session_version + 1,
        calendar_export_token = NULL,
        reset_token = NULL,
        reset_token_expires = NULL,
        verification_token = NULL,
        verification_token_expires = NULL,
        canvas_token = NULL,
        canvas_domain = NULL
      WHERE user_id = ${user.user_id}::uuid
        AND deleted_at IS NULL
    `;
    await cancelUserJobs(tx, user.user_id);
  });

  return clearSessionCookies(
    NextResponse.json({
      success: true,
      message: `Account scheduled for deletion. Data will be permanently removed after ${DELETED_ACCOUNT_GRACE_DAYS} days.`,
    }),
    request,
  );
});
