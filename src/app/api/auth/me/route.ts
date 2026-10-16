import { clearSessionCookies, validateSession } from "@/lib/auth/session";
import { getLinkedProviders } from "@/lib/auth/oauth";
import sql from "@/database/pgsql";
import logger from "@/lib/logger";
import { NextResponse, type NextRequest } from "next/server";

interface ProfileRow {
  display_name: string | null;
  avatar_url: string | null;
  locale: string | null;
}

async function fetchProfile(userId: string) {
  const [[profile], providers] = await Promise.all([
    sql<ProfileRow[]>`SELECT display_name, avatar_url, locale FROM app.login WHERE user_id = ${userId}::uuid`,
    getLinkedProviders(userId),
  ]);
  return {
    displayName: profile?.display_name ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    locale: profile?.locale ?? null,
    // validateSession only accepts verified accounts
    emailVerified: true,
    linkedProviders: providers,
  };
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const user = await validateSession();
    if (user) {
      const profile = await fetchProfile(user.user_id);
      return Response.json({
        success: true,
        user: {
          user_id: user.user_id,
          email: user.email,
          ...profile,
        },
      });
    }

    // drop revoked or stale cookies so the proxy stops treating them as a session
    return clearSessionCookies(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      request,
    );
  } catch (error) {
    logger.error("auth me error", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return Response.json(
      { error: "Unable to verify session" },
      { status: 503 },
    );
  }
}
