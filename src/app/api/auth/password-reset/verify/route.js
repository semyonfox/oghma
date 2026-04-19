import crypto from "crypto";
import bcrypt from "bcryptjs";
import sql from "@/database/pgsql.js";
import { createErrorResponse, parseJsonBody } from "@/lib/auth.js";
import { validateAuthCredentials } from "@/lib/validation.js";
import { checkRateLimit, getClientIp } from "@/lib/rateLimiter";
import logger from "@/lib/logger";
import { assertTrustedOrigin } from "@/lib/api-error";

export async function POST(request) {
  try {
    assertTrustedOrigin(request);
    const limited = await checkRateLimit(
      "password-verify",
      getClientIp(request),
    );
    if (limited) return limited;

    const { data: body, error: parseError } = await parseJsonBody(request);
    if (parseError) return parseError;

    const { token, password } = body;
    if (!token || !password)
      return createErrorResponse("Token and password are required", 400);

    const validation = validateAuthCredentials(
      "dummy@email.com",
      password,
      true,
    );
    if (!validation.isValid) {
      return new Response(JSON.stringify({ errors: validation.errors }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // hash the incoming token to compare against the stored hash
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const users = await sql`
            SELECT user_id, email FROM app.login
            WHERE reset_token = ${tokenHash} AND reset_token_expires > NOW()
        `;

    if (users.length === 0)
      return createErrorResponse("Invalid or expired reset token", 400);

    const hashedPassword = await bcrypt.hash(password, 10);
    await sql`
            UPDATE app.login
            SET hashed_password = ${hashedPassword}, reset_token = NULL, reset_token_expires = NULL
            WHERE user_id = ${users[0].user_id}
        `;

    return new Response(
      JSON.stringify({ message: "Password reset successful" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    logger.error("password reset error", { error });
    return createErrorResponse("Failed to reset password", 500);
  }
}
