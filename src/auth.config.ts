import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { loginSchema } from "@/lib/validations/schemas";
import { reserveLoginAttempt, clearFailedAttempts } from "@/lib/loginLockout";
import type { NextAuthConfig } from "next-auth";
import type { JWT } from "next-auth/jwt";
import sql from "@/database/pgsql";
import logger from "@/lib/logger";
import {
  findOrCreateOAuthUser,
  resolveVerifiedOAuthEmail,
} from "@/lib/auth-oauth";
import type { OAuthProfile } from "@/lib/auth-oauth";
import { getRequestLocale } from "@/lib/i18n/server";

const providers: NextAuthConfig["providers"] = [];

interface LoginCredentialsUser {
  user_id: string;
  email: string;
  hashed_password: string;
  email_verified: boolean;
  session_version: number;
}

interface LoginProfileRow {
  session_version: number;
  display_name: string | null;
  avatar_url: string | null;
  locale: string | null;
}

interface AppJWT extends JWT {
  sessionVersion?: number;
  validationUnavailable?: boolean;
  user_id?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  locale?: string | null;
}

function authErrorDetails(error: unknown) {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[A-Z0-9_]{1,24}$/.test(error.code)
      ? error.code
      : undefined;
  return {
    errorType:
      error instanceof Error && /^[A-Za-z]{1,32}$/.test(error.name)
        ? error.name
        : "unknown",
    code,
  };
}

if (process.env.GOOGLE_ID && process.env.GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_ID,
      clientSecret: process.env.GOOGLE_SECRET,
    }),
  );
}

if (process.env.GITHUB_ID && process.env.GITHUB_SECRET) {
  providers.push(
    GitHub({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
      authorization: { params: { scope: "read:user user:email" } },
    }),
  );
}

if (process.env.ENABLE_CREDENTIALS_AUTH !== "false") {
  try {
    providers.push(
      Credentials({
        id: "credentials",
        name: "Credentials",
        credentials: {
          email: { label: "Email", type: "text" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials) {
          const parsed = loginSchema.safeParse(credentials);
          if (!parsed.success) return null;
          const email = parsed.data.email.toLowerCase();
          const password = parsed.data.password;

          try {
            if (!(await reserveLoginAttempt(email))) return null;
            const users = await sql<LoginCredentialsUser[]>`
                            SELECT user_id, email, hashed_password, email_verified, session_version
                            FROM app.login
                            WHERE lower(btrim(email)) = ${email}
                              AND is_active = true
                              AND deleted_at IS NULL
                        `;

            if (users.length !== 1) {
              return null;
            }

            const user = users[0];
            const isPasswordValid = await bcrypt.compare(
              password,
              user.hashed_password,
            );

            if (!isPasswordValid) {
              return null;
            }

            if (user.email_verified !== true) return null;
            await clearFailedAttempts(email);
            return { id: user.user_id, email: user.email, session_version: user.session_version };
          } catch (error) {
            logger.error("credentials auth error", authErrorDetails(error));
            return null;
          }
        },
      }),
    );
  } catch (error) {
    logger.warn(
      "failed to initialize credentials provider",
      authErrorDetails(error),
    );
  }
}

export const authConfig: NextAuthConfig = {
  trustHost: true, // trust forwarded host headers behind Amplify/CloudFront
  secret:
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.JWT_SECRET,
  providers,
  session: { strategy: "jwt" as const },
  pages: {
    signIn: "/login",
    error: "/auth/error",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!account || account.provider === "credentials") return true;

      try {
        const rawProfile = profile ? { ...profile } : {};
        const verifiedEmail = await resolveVerifiedOAuthEmail(
          account.provider,
          rawProfile,
          account.access_token,
        );
        if (!verifiedEmail) {
          logger.warn("oauth provider did not return a verified email", {
            provider: account.provider,
          });
          return false;
        }
        rawProfile.email_verified = true;

        const oauthProfile: OAuthProfile = {
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          email: verifiedEmail,
          name: user.name ?? profile?.name,
          image: user.image ?? profile?.picture ?? profile?.avatar_url,
          locale:
            typeof profile?.locale === "string" ? profile.locale : null,
          rawProfile,
        };

        // locale detection must not prevent sign-in if request context is unavailable
        const signupLocale = await getRequestLocale().catch(() => undefined);
        const userId = await findOrCreateOAuthUser(
          oauthProfile,
          rawProfile,
          signupLocale,
        );
        // attach user_id so jwt callback can pick it up
        user.id = userId;
        user.email = verifiedEmail;
        return true;
      } catch (error) {
        logger.error("oauth sign-in failed", {
          ...authErrorDetails(error),
          provider: account.provider,
        });
        return false;
      }
    },

    async jwt({ token, user }) {
      const appToken: AppJWT = token;
      // on initial sign-in, user is defined — fetch profile from DB
      if (user) {
        appToken.user_id = user.id ?? appToken.sub ?? null;
        appToken.email = user.email ?? appToken.email ?? null;

        // fetch profile fields for the session
        try {
          const rows = await sql<LoginProfileRow[]>`
                        SELECT display_name, avatar_url, locale, session_version
                        FROM app.login WHERE user_id = ${user.id}::uuid
                          AND is_active = true AND deleted_at IS NULL AND email_verified = true
                    `;
          if (rows.length > 0) {
            const row = rows[0];
            appToken.sessionVersion = user.session_version ?? row.session_version;
            appToken.displayName = row.display_name;
            appToken.avatarUrl = row.avatar_url;
            appToken.locale = row.locale;
          }
        } catch (error) {
          logger.error("jwt callback db query failed", {
            ...authErrorDetails(error),
          });
        }
      }
      if (typeof appToken.user_id !== "string" || !Number.isSafeInteger(appToken.sessionVersion)) return null;
      appToken.validationUnavailable = false;
      try {
        const [active] = await sql`
          SELECT user_id FROM app.login
          WHERE user_id = ${appToken.user_id}::uuid
            AND session_version = ${Number(appToken.sessionVersion)}
            AND email_verified = true AND is_active = true AND deleted_at IS NULL
        `;
        return active ? appToken : null;
      } catch (error) {
        // carry outages through the session because Auth.js masks thrown callback errors
        logger.error("session validation unavailable", authErrorDetails(error));
        appToken.validationUnavailable = true;
        return appToken;
      }
    },

    async session({ session, token }) {
      const appSession = session;
      const appToken: AppJWT = token;
      appSession.validationUnavailable = appToken.validationUnavailable === true;
      if (appSession.user && appToken) {
        if (typeof appToken.user_id !== "string" || typeof appToken.email !== "string") {
          throw new Error("Invalid session identity");
        }
        appSession.user.sessionVersion = appToken.sessionVersion;
        appSession.user.id = appToken.user_id;
        appSession.user.email = appToken.email;
        appSession.user.displayName = appToken.displayName ?? null;
        appSession.user.avatarUrl = appToken.avatarUrl ?? null;
        appSession.user.locale = appToken.locale ?? null;
      }
      return appSession;
    },
  },
  events: {
    async signIn({ account }) {
      logger.info("user signed in", {
        provider: account?.provider,
      });
    },
  },
};
