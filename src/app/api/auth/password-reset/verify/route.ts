import bcrypt from "bcryptjs";
import sql from "@/database/pgsql";
import { createErrorResponse, parseJsonBody } from "@/lib/auth";
import { validateAuthCredentials } from "@/lib/auth-credentials";
import { checkRateLimit, getClientIp } from "@/lib/rateLimiter";
import logger from "@/lib/logger";
import { assertTrustedOrigin } from "@/lib/api-error";
import { hashToken } from "@/lib/tokens";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    assertTrustedOrigin(request);
    const limited = await checkRateLimit(
      "password-verify",
      getClientIp(request),
    );
    if (limited) return limited;

    const { data: body, error: parseError } = await parseJsonBody(request);
    if (parseError) return parseError;

    const token = typeof body?.token === "string" ? body.token : "";
    const password = typeof body?.password === "string" ? body.password : "";
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

    const tokenHash = hashToken(token);
    const user = await sql.begin(async (tx) => {
      const [candidate] = await tx<{ user_id: string; email: string }[]>`
        SELECT user_id, email
        FROM app.login
        WHERE reset_token = ${tokenHash}
          AND reset_token_expires > NOW()
        FOR UPDATE
      `;
      if (!candidate) return null;

      const hashedPassword = await bcrypt.hash(password, 10);
      const [updated] = await tx<{ user_id: string; email: string }[]>`
        UPDATE app.login
        SET hashed_password = ${hashedPassword},
            reset_token = NULL,
            reset_token_expires = NULL
        WHERE user_id = ${candidate.user_id}::uuid
          AND reset_token = ${tokenHash}
        RETURNING user_id, email
      `;
      return updated ?? null;
    });

    if (!user)
      return createErrorResponse("Invalid or expired reset token", 400);

    return new Response(
      JSON.stringify({ message: "Password reset successful" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    logger.error("password reset error", { error });
    return createErrorResponse("Failed to reset password", 500);
  }
}
