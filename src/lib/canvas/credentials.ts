import sql from "@/database/pgsql.js";
import { decrypt } from "@/lib/crypto";

export interface CanvasCredentials {
  domain: string;
  token: string;
}

export async function loadCanvasCredentials(
  userId: string,
): Promise<CanvasCredentials | null> {
  const [row] = await sql`
    SELECT canvas_token, canvas_domain
    FROM app.login
    WHERE user_id = ${userId}::uuid
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
