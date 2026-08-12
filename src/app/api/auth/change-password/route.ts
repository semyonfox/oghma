import bcrypt from "bcryptjs";
import sql from "@/database/pgsql";
import {
  validateSession,
  createErrorResponse,
  parseJsonBody,
} from "@/lib/auth";
import { validatePassword } from "@/lib/validation";
import logger from "@/lib/logger";
import { assertTrustedOrigin } from "@/lib/api-error";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    assertTrustedOrigin(request);
    const user = await validateSession();
    if (!user) {
      return createErrorResponse("Unauthorized", 401);
    }

    const { data: body, error: parseError } = await parseJsonBody(request);
    if (parseError) return parseError;

    const currentPassword =
      typeof body?.currentPassword === "string" ? body.currentPassword : "";
    const newPassword =
      typeof body?.newPassword === "string" ? body.newPassword : "";
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

    const [account] = await sql<{ hashed_password: string | null }[]>`
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
