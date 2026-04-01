import sql from "@/database/pgsql.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import logger from "@/lib/logger";

// providers that always return verified emails
const ALWAYS_VERIFIED_PROVIDERS = new Set(["google"]);

export interface OAuthProfile {
  provider: string;
  providerAccountId: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  locale?: string | null;
  rawProfile?: Record<string, unknown>;
}

export interface OAuthAccountRow {
  id: string;
  user_id: string;
  provider: string;
  provider_id: string;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
  locale: string | null;
}

/**
 * check whether the provider guarantees the email is verified.
 * google always verifies. other providers require checking the profile.
 */
export function isEmailVerifiedByProvider(
  provider: string,
  profile: Record<string, unknown>,
): boolean {
  if (ALWAYS_VERIFIED_PROVIDERS.has(provider)) return true;
  return profile.email_verified === true;
}

/**
 * look up an existing oauth account by provider + provider ID
 */
export async function findOAuthAccount(
  provider: string,
  providerId: string,
): Promise<OAuthAccountRow | null> {
  const rows = await (sql as any)`
        SELECT id, user_id, provider, provider_id, email, name, avatar_url, locale
        FROM app.oauth_accounts
        WHERE provider = ${provider} AND provider_id = ${providerId}
    `;
  return rows.length > 0 ? rows[0] : null;
}

/**
 * insert or upsert an oauth account row.
 * ON CONFLICT updates the profile data (provider may change name/avatar).
 */
export async function linkOAuthAccount(
  userId: string,
  profile: OAuthProfile,
): Promise<void> {
  await (sql as any)`
        INSERT INTO app.oauth_accounts (
            user_id, provider, provider_id, email, name, avatar_url, locale, raw_profile
        ) VALUES (
            ${userId}::uuid,
            ${profile.provider},
            ${profile.providerAccountId},
            ${profile.email ?? null},
            ${profile.name ?? null},
            ${profile.image ?? null},
            ${profile.locale ?? null},
            ${JSON.stringify(profile.rawProfile ?? {})}::jsonb
        )
        ON CONFLICT (provider, provider_id) DO UPDATE SET
            email = EXCLUDED.email,
            name = EXCLUDED.name,
            avatar_url = EXCLUDED.avatar_url,
            locale = EXCLUDED.locale,
            raw_profile = EXCLUDED.raw_profile
    `;
}

/**
 * update display_name, avatar_url, locale on app.login if currently null.
 * write-once: only fills in blanks, never overwrites user-set values.
 */
export async function syncProfileToLogin(
  userId: string,
  profile: {
    name?: string | null;
    image?: string | null;
    locale?: string | null;
  },
): Promise<void> {
  await (sql as any)`
        UPDATE app.login SET
            display_name = COALESCE(display_name, ${profile.name ?? null}),
            avatar_url = COALESCE(avatar_url, ${profile.image ?? null}),
            locale = COALESCE(locale, ${profile.locale ?? null})
        WHERE user_id = ${userId}::uuid
    `;
}

/**
 * list all oauth providers linked to a user (for settings UI)
 */
export async function getLinkedProviders(
  userId: string,
): Promise<Array<{ provider: string; email: string | null }>> {
  return await (sql as any)`
        SELECT provider, email
        FROM app.oauth_accounts
        WHERE user_id = ${userId}::uuid
        ORDER BY created_at
    `;
}

/**
 * the main auto-link flow:
 * 1. check if oauth account already exists → return user_id
 * 2. if email is verified by provider, check app.login by email → link
 * 3. otherwise create new app.login row + link
 */
export async function findOrCreateOAuthUser(
  profile: OAuthProfile,
  providerProfile: Record<string, unknown>,
): Promise<string> {
  // step 1: existing oauth account?
  const existing = await findOAuthAccount(
    profile.provider,
    profile.providerAccountId,
  );
  if (existing) {
    // update profile data on the oauth_accounts row
    await linkOAuthAccount(existing.user_id, profile);
    await syncProfileToLogin(existing.user_id, {
      name: profile.name,
      image: profile.image,
      locale: profile.locale,
    });
    return existing.user_id;
  }

  // step 2: auto-link by email (only if verified)
  const emailVerified = isEmailVerifiedByProvider(
    profile.provider,
    providerProfile,
  );
  if (emailVerified && profile.email) {
    const loginRows = await (sql as any)`
            SELECT user_id FROM app.login
            WHERE email = ${profile.email}
              AND is_active = true
              AND deleted_at IS NULL
        `;
    if (loginRows.length > 0) {
      const userId = loginRows[0].user_id;
      await linkOAuthAccount(userId, profile);
      await syncProfileToLogin(userId, {
        name: profile.name,
        image: profile.image,
        locale: profile.locale,
      });
      logger.info("oauth account linked to existing user", {
        provider: profile.provider,
        userId,
      });
      return userId;
    }
  }

  // step 3: create new user
  // generate an unguessable random password hash for the NOT NULL constraint
  const randomPassword = crypto.randomBytes(32).toString("hex");
  const hashedPassword = await bcrypt.hash(randomPassword, 10);

  // ON CONFLICT handles race condition: if another request just created the same email
  const insertResult = await (sql as any)`
        INSERT INTO app.login (email, hashed_password, display_name, avatar_url, locale)
        VALUES (
            ${profile.email},
            ${hashedPassword},
            ${profile.name ?? null},
            ${profile.image ?? null},
            ${profile.locale ?? null}
        )
        ON CONFLICT (email) DO NOTHING
        RETURNING user_id
    `;

  let userId: string;
  if (insertResult.length > 0) {
    userId = insertResult[0].user_id;
  } else {
    // race: another request created it first, fetch the existing one
    const existing = await (sql as any)`
            SELECT user_id FROM app.login WHERE email = ${profile.email}
        `;
    userId = existing[0].user_id;
  }

  await linkOAuthAccount(userId, profile);
  logger.info("new oauth user created", {
    provider: profile.provider,
    userId,
  });
  return userId;
}
