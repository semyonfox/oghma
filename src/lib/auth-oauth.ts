import sql from "@/database/pgsql";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import {
  gettingStartedNoteTitle,
  renderGettingStartedNote,
} from "@/lib/chat/app-guide";
import { insertNoteWithTree } from "@/lib/notes/storage/create-note";
import { generateUUID } from "@/lib/utils/uuid";
import { Locale, normalizeLocale } from "@/locales";

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

type UserIdRow = { user_id: string };

type LinkedProviderRow = { provider: string; email: string | null };

/**
 * check whether the provider guarantees the email is verified.
 * google always verifies. other providers require checking the profile.
 */
export function isEmailVerifiedByProvider(
  provider: string,
  profile: Record<string, unknown>,
): boolean {
  return profile.email_verified === true;
}

export async function resolveVerifiedOAuthEmail(
  provider: string,
  profile: Record<string, unknown>,
  accessToken?: string | null,
): Promise<string | null> {
  if (
    provider === "google" &&
    profile.email_verified === true &&
    typeof profile.email === "string"
  ) {
    return profile.email.toLowerCase();
  }

  if (provider === "github" && accessToken) {
    const response = await fetch("https://api.github.com/user/emails", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!response.ok) return null;

    const emails: unknown = await response.json();
    if (!Array.isArray(emails)) return null;
    const verifiedPrimary = emails.find(
      (entry: unknown) =>
        typeof entry === "object" &&
        entry !== null &&
        "primary" in entry &&
        "verified" in entry &&
        "email" in entry &&
        entry.primary === true &&
        entry.verified === true &&
        typeof entry.email === "string",
    );
    return typeof verifiedPrimary === "object" &&
      verifiedPrimary !== null &&
      "email" in verifiedPrimary &&
      typeof verifiedPrimary.email === "string"
      ? verifiedPrimary.email.toLowerCase()
      : null;
  }

  return null;
}

/**
 * look up an existing oauth account by provider + provider ID
 */
export async function findOAuthAccount(
  provider: string,
  providerId: string,
): Promise<OAuthAccountRow | null> {
  const rows = await sql<OAuthAccountRow[]>`
        SELECT id, user_id, provider, provider_id, email, name, avatar_url, locale
        FROM app.oauth_accounts
        WHERE provider = ${provider} AND provider_id = ${providerId}
    `;
  return rows[0] ?? null;
}

/**
 * insert or upsert an oauth account row.
 * ON CONFLICT updates the profile data (provider may change name/avatar).
 */
export async function linkOAuthAccount(
  userId: string,
  profile: OAuthProfile,
): Promise<void> {
  await sql`
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
            ${JSON.stringify(profile.rawProfile ?? {})}::text::jsonb
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
  await sql`
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
): Promise<LinkedProviderRow[]> {
  return sql<LinkedProviderRow[]>`
        SELECT provider, email
        FROM app.oauth_accounts
        WHERE user_id = ${userId}::uuid
        ORDER BY created_at
    `;
}

// serialise linking and registration races before claiming an email address
export async function findOrCreateOAuthUser(
  profile: OAuthProfile,
  providerProfile: Record<string, unknown>,
  signupLocale?: Locale,
): Promise<string> {
  if (
    !isEmailVerifiedByProvider(profile.provider, providerProfile) ||
    !profile.email
  ) {
    throw new Error("OAuth provider did not supply a verified email");
  }
  const email = profile.email.trim().toLowerCase();
  const replacementHash = await bcrypt.hash(
    crypto.randomBytes(32).toString("hex"),
    10,
  );
  const locale = signupLocale ?? normalizeLocale(profile.locale) ?? Locale.EN;
  const noteId = generateUUID();

  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${profile.provider + ":" + profile.providerAccountId}, 1))`;
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${email}, 2))`;
    const [linked] = await tx<UserIdRow[]>`
      SELECT user_id FROM app.oauth_accounts
      WHERE provider = ${profile.provider} AND provider_id = ${profile.providerAccountId}
    `;
    let userId = linked?.user_id;
    if (!userId) {
      const [created] = await tx<UserIdRow[]>`
        INSERT INTO app.login (email, hashed_password, display_name, avatar_url, locale, email_verified, welcome_note_id)
        VALUES (${email}, ${replacementHash}, ${profile.name ?? null}, ${profile.image ?? null},
                ${locale}, true, ${noteId}::uuid)
        ON CONFLICT ((lower(btrim(email)))) DO NOTHING RETURNING user_id
      `;
      if (created) {
        userId = created.user_id;
        await insertNoteWithTree(tx, {
          noteId,
          userId,
          title: gettingStartedNoteTitle(locale),
          content: renderGettingStartedNote(locale),
          isFolder: false,
        });
      } else {
        const [existing] = await tx<UserIdRow[]>`
          SELECT user_id FROM app.login WHERE lower(btrim(email)) = ${email} FOR UPDATE
        `;
        userId = existing?.user_id;
      }
    }
    if (!userId) throw new Error("OAuth account could not be resolved");
    const [account] = await tx<
      {
        user_id: string;
        email_verified: boolean;
        is_active: boolean;
        deleted_at: Date | null;
      }[]
    >`
      SELECT user_id, email_verified, is_active, deleted_at FROM app.login
      WHERE user_id = ${userId}::uuid FOR UPDATE
    `;
    if (!account || !account.is_active || account.deleted_at) {
      throw new Error("OAuth account is unavailable");
    }
    if (!account.email_verified) {
      // the verified mailbox owner must not inherit a registrant's password or tokens
      await tx`
        UPDATE app.login SET hashed_password = ${replacementHash}, email_verified = true,
          session_version = session_version + 1,
          verification_token = NULL, verification_token_expires = NULL,
          reset_token = NULL, reset_token_expires = NULL
        WHERE user_id = ${userId}::uuid
      `;
    }
    await tx`
      INSERT INTO app.oauth_accounts (user_id, provider, provider_id, email, name, avatar_url, locale, raw_profile)
      VALUES (${userId}::uuid, ${profile.provider}, ${profile.providerAccountId}, ${email},
              ${profile.name ?? null}, ${profile.image ?? null}, ${profile.locale ?? null},
              ${JSON.stringify(profile.rawProfile ?? {})}::text::jsonb)
      ON CONFLICT (provider, provider_id) DO UPDATE SET
        email = EXCLUDED.email, name = EXCLUDED.name, avatar_url = EXCLUDED.avatar_url,
        locale = EXCLUDED.locale, raw_profile = EXCLUDED.raw_profile
    `;
    await tx`
      UPDATE app.login SET display_name = COALESCE(display_name, ${profile.name ?? null}),
        avatar_url = COALESCE(avatar_url, ${profile.image ?? null}), locale = COALESCE(locale, ${profile.locale ?? null})
      WHERE user_id = ${userId}::uuid
    `;
    return userId;
  });
}
