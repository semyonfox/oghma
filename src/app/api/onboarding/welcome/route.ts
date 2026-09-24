import { NextResponse } from "next/server";
import sql from "@/database/pgsql";
import { requireAuth, withErrorHandler } from "@/lib/api-error";

export const GET = withErrorHandler(async () => {
  const user = await requireAuth();
  const [welcome] = await sql<{ note_id: string }[]>`
    SELECT login.welcome_note_id::text AS note_id
    FROM app.login AS login
    JOIN app.notes AS note
      ON note.note_id = login.welcome_note_id
      AND note.user_id = login.user_id
      AND note.deleted_at IS NULL
    WHERE login.user_id = ${user.user_id}::uuid
  `;

  return NextResponse.json(
    { noteId: welcome?.note_id ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
});

export const POST = withErrorHandler(async () => {
  const user = await requireAuth();
  await sql`
    UPDATE app.login
    SET welcome_note_id = NULL
    WHERE user_id = ${user.user_id}::uuid
      AND welcome_note_id IS NOT NULL
  `;
  return NextResponse.json({ dismissed: true });
});
