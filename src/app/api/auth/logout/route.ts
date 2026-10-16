// clears the custom JWT and Auth.js cookies; the JWTs themselves stay valid
// until expiry, so revoking every device needs a session_version bump instead
import { NextResponse, type NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-error";
import { clearSessionCookies } from "@/lib/auth/session";

const AUTH_JS_FLOW_COOKIES = [
  "authjs.csrf-token",
  "__Host-authjs.csrf-token",
  "authjs.callback-url",
  "__Secure-authjs.callback-url",
];

export const POST = withErrorHandler(async (request: NextRequest) =>
  clearSessionCookies(
    NextResponse.json({ success: true, message: "Logged out successfully" }),
    request,
    AUTH_JS_FLOW_COOKIES,
  ),
);
