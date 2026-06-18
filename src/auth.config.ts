import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import type { Account, Profile, Session, User } from "next-auth";
import type { JWT, NextAuthConfig } from "next-auth";
import sql from "@/database/pgsql";
import logger from "@/lib/logger";
import { findOrCreateOAuthUser } from "@/lib/auth-oauth";
import type { OAuthProfile } from "@/lib/auth-oauth";

const providers: NextAuthConfig["providers"] = [];

interface LoginCredentialsUser {
  user_id: string;
  email: string;
  hashed_password: string;
}

interface LoginProfileRow {
  display_name: string | null;
  avatar_url: string | null;
  locale: string | null;
}

interface AppJWT extends JWT {
  user_id?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  locale?: string | null;
}

interface AppSessionUser {
  id?: string;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  locale?: string | null;
}

interface AppSession extends Session {
  user?: AppSessionUser | null;
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
          const email = credentials?.email;
          const password = credentials?.password;
          if (!email || !password) {
            return null;
          }

          try {
            const users = (await sql`
                            SELECT user_id, email, hashed_password
                            FROM app.login
                            WHERE email = ${email}
                              AND is_active = true
                              AND deleted_at IS NULL
                        `) as LoginCredentialsUser[];

            if (users.length === 0) {
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

            return { id: user.user_id, email: user.email };
          } catch (error) {
            logger.error("credentials auth error", { error });
            return null;
          }
        },
      }),
    );
  } catch (error) {
    logger.warn("failed to initialize credentials provider", { error });
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
    async signIn({
      user,
      account,
      profile,
    }: {
      user: User;
      account: Account | null;
      profile?: Profile;
    }) {
      if (!account || account.provider === "credentials") return true;

      try {
        const oauthProfile: OAuthProfile = {
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          email: user.email ?? profile?.email,
          name: user.name ?? profile?.name,
          image: user.image ?? profile?.picture ?? profile?.avatar_url,
          locale:
            (profile as { locale?: string | null } | undefined)?.locale ?? null,
          rawProfile: profile ? { ...profile } : {},
        };

        const userId = await findOrCreateOAuthUser(
          oauthProfile,
          profile ? { ...profile } : {},
        );
        // attach user_id so jwt callback can pick it up
        (user as User & { id: string }).id = userId;
        return true;
      } catch (error) {
        logger.error("oauth sign-in failed", {
          error,
          provider: account.provider,
        });
        return false;
      }
    },

    async jwt({
      token,
      user,
    }: {
      token: AppJWT;
      user?: User;
    }) {
      // on initial sign-in, user is defined — fetch profile from DB
      if (user) {
        token.user_id = user.id;
        token.email = user.email;

        // fetch profile fields for the session
        try {
          const rows = (await sql`
                        SELECT display_name, avatar_url, locale
                        FROM app.login WHERE user_id = ${user.id}::uuid
                    `) as LoginProfileRow[];
          if (rows.length > 0) {
            const row = rows[0];
            token.displayName = row.display_name;
            token.avatarUrl = row.avatar_url;
            token.locale = row.locale;
          }
        } catch (error) {
          logger.error("jwt callback db query failed", {
            error,
            userId: user.id,
          });
        }
      }
      return token;
    },

    async session({
      session,
      token,
    }: {
      session: AppSession;
      token: AppJWT;
    }) {
      if (session.user && token) {
        session.user.id = token.user_id;
        session.user.email = token.email;
        session.user.displayName = token.displayName ?? null;
        session.user.avatarUrl = token.avatarUrl ?? null;
        session.user.locale = token.locale ?? null;
      }
      return session;
    },
  },
  events: {
    async signIn({ user, account }: { user: User; account?: Account | null }) {
      logger.info("user signed in", {
        email: user.email,
        provider: account?.provider,
      });
    },
  },
};
