import { NextResponse, type NextRequest } from "next/server";
import sql from "@/database/pgsql";
import { parseJsonObject, requireAuth, withErrorHandler } from "@/lib/api-error";
import { clearSessionCookies } from "@/lib/auth/session";

const AUTH_JS_FLOW_COOKIES = [
  "authjs.csrf-token",
  "__Host-authjs.csrf-token",
  "authjs.callback-url",
  "__Secure-authjs.callback-url",
];

export const POST = withErrorHandler(async (request: NextRequest) => {
  const body = request.body !== null && request.headers.get("content-type")?.includes("application/json")
    ? await parseJsonObject(request) : {};
  if (body.everywhere === true) {
    const user = await requireAuth();
    await sql`UPDATE app.login SET session_version = session_version + 1
      WHERE user_id = ${user.user_id}::uuid`;
  }
  return clearSessionCookies(
    NextResponse.json({ success: true, message: "Logged out successfully" }),
    request,
    AUTH_JS_FLOW_COOKIES,
  );
});
