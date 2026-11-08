import sql from "@/database/pgsql";
import { decrypt } from "@/lib/crypto";

export interface CanvasCredentials {
  domain: string;
  token: string;
}

export async function loadCanvasCredentials(
  userId: string,
): Promise<CanvasCredentials | null> {
  const [row] = await sql<
    { canvas_token: string | null; canvas_domain: string | null }[]
  >`
    SELECT canvas_token, canvas_domain
    FROM app.login
    WHERE user_id = ${userId}::uuid
      AND is_active = true AND deleted_at IS NULL AND email_verified = true
    LIMIT 1
  `;

  if (!row?.canvas_token || !row?.canvas_domain) {
    return null;
  }

  return {
    domain: row.canvas_domain,
    token: decrypt(row.canvas_token, userId),
  };
}

// only the first rejection is stamped, so the banner can say since when
export async function markCanvasTokenInvalid(userId: string): Promise<void> {
  await sql`
    UPDATE app.login
    SET canvas_token_invalid_at = COALESCE(canvas_token_invalid_at, NOW())
    WHERE user_id = ${userId}::uuid AND canvas_token IS NOT NULL
  `;
}

export async function clearCanvasTokenInvalid(userId: string): Promise<void> {
  await sql`
    UPDATE app.login
    SET canvas_token_invalid_at = NULL
    WHERE user_id = ${userId}::uuid AND canvas_token_invalid_at IS NOT NULL
  `;
}
