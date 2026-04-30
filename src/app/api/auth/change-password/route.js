import bcrypt from "bcryptjs";
import sql from "@/database/pgsql.js";
import {
  validateSession,
  createErrorResponse,
  parseJsonBody,
} from "@/lib/auth.js";
import { validatePassword } from "@/lib/validation.js";
import logger from "@/lib/logger";
import { assertTrustedOrigin } from "@/lib/api-error";

export async function POST(request) {
  try {
    assertTrustedOrigin(request);
    const user = await validateSession();
    if (!user) {
      return createErrorResponse("Unauthorized", 401);
    }

    const { data: body, error: parseError } = await parseJsonBody(request);
    if (parseError) return parseError;

    const { currentPassword, newPassword } = body ?? {};
    if (!currentPassword || !newPassword) {
      return createErrorResponse(
        "Current password and new password are required",
        400,
      );
    }

    if (currentPassword === newPassword) {
      return createErrorResponse(
        "New password must be different from current password",
        400,
      );
    }

    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      return createErrorResponse(passwordValidation.errors.join("; "), 400);
    }

    const [account] = await sql`
      SELECT hashed_password
      FROM app.login
      WHERE user_id = ${user.user_id}::uuid
        AND is_active = true
        AND deleted_at IS NULL
      LIMIT 1
    `;

    if (!account?.hashed_password) {
      return createErrorResponse("Unauthorized", 401);
    }

    const passwordMatches = await bcrypt.compare(
      currentPassword,
      account.hashed_password,
    );
    if (!passwordMatches) {
      return createErrorResponse("Current password is incorrect", 400);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await sql`
      UPDATE app.login
      SET hashed_password = ${hashedPassword},
          reset_token = NULL,
          reset_token_expires = NULL
      WHERE user_id = ${user.user_id}::uuid
    `;

    return Response.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    logger.error("change password error", { error });
    return createErrorResponse("Failed to change password", 500);
  }
}
