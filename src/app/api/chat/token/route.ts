import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rateLimiter";
import jwt from "jsonwebtoken";

// issues a short-lived JWT for the standalone chat Lambda
// the frontend calls this first, then sends the token to the Lambda function URL
export const POST = withErrorHandler(async () => {
  const user = await validateSession();
  if (!user) return tracedError("Unauthorized", 401);

  const limited = await checkRateLimit("chat", user.user_id);
  if (limited) return limited;

  const token = jwt.sign(
    { sub: user.user_id, email: user.email },
    process.env.JWT_SECRET!,
    { expiresIn: "60s" },
  );

  return NextResponse.json({ token });
});
