import { validateSession } from "@/lib/auth";
import { getLinkedProviders } from "@/lib/auth-oauth";
import sql from "@/database/pgsql";
import logger from "@/lib/logger";
import { NextResponse, type NextRequest } from "next/server";

interface ProfileRow {
  display_name: string | null;
  avatar_url: string | null;
  locale: string | null;
  email_verified: boolean | null;
}

async function fetchProfile(userId: string) {
  const [profileRows, providers] = await Promise.all([
    sql<ProfileRow[]>`SELECT display_name, avatar_url, locale, email_verified FROM app.login WHERE user_id = ${userId}::uuid`,
    getLinkedProviders(userId),
  ]);
  const profile = profileRows[0] || {};
  return {
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url,
    locale: profile.locale,
    emailVerified: profile.email_verified ?? true,
    linkedProviders: providers,
  };
}

export async function GET(_request: NextRequest): Promise<Response> {
  try {
    const jwtUser = await validateSession();
    if (jwtUser) {
      const profile = await fetchProfile(jwtUser.user_id);
      return Response.json({
        success: true,
        user: {
          user_id: jwtUser.user_id,
          email: jwtUser.email,
          ...profile,
        },
      });
    }

    const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const names = new Set(["session", "authjs.session-token", "__Secure-authjs.session-token"]);
    for (const cookie of _request.cookies.getAll()) {
      if (/^(?:__Secure-)?authjs\.session-token\.\d+$/.test(cookie.name)) names.add(cookie.name);
    }
    for (const name of names)
      response.cookies.set(name, "", {
        path: "/",
        maxAge: 0,
        httpOnly: true,
        sameSite: "lax",
        secure:
          name.startsWith("__Secure-") ||
          _request.nextUrl.protocol === "https:",
      });
    return response;
  } catch (error) {
    logger.error("auth me error", { error });
    return Response.json(
      { error: "Unable to verify session" },
      { status: 503 },
    );
  }
}
