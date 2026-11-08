import { NextResponse } from "next/server";
import { requireAuth, withErrorHandler } from "@/lib/api-error";
import sql from "@/database/pgsql";

// cheap read for the workspace banner: never calls canvas, only reports what
// the last canvas request recorded about the stored token
export const GET = withErrorHandler(async () => {
  const user = await requireAuth();
  const [row] = await sql<{ connected: boolean; invalid_at: Date | null }[]>`
    SELECT canvas_token IS NOT NULL AS connected, canvas_token_invalid_at AS invalid_at
    FROM app.login
    WHERE user_id = ${user.user_id}::uuid
  `;
  return NextResponse.json(
    {
      connected: row?.connected ?? false,
      invalidSince: row?.invalid_at ? new Date(row.invalid_at).toISOString() : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
});
