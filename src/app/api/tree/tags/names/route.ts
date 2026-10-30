import { NextResponse } from "next/server";
import { requireAuth, withErrorHandler } from "@/lib/api-error";
import { readTagNames } from "@/lib/notes/storage/tags-view";

/** GET /api/tree/tags/names: the user's #tags with note counts, for autocomplete */
export const GET = withErrorHandler(async () => {
  const user = await requireAuth();
  return NextResponse.json(
    { tags: await readTagNames(user.user_id) },
    { headers: { "Cache-Control": "no-store" } },
  );
});
