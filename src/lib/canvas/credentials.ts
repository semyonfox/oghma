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
