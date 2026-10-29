import { NextResponse } from "next/server";
import { ApiError, requireAuth, requireValidId, withErrorHandler } from "@/lib/api-error";
import { readTagsView } from "@/lib/notes/storage/tags-view";
import { MAX_TAGS_VIEW_ROOTS } from "@/lib/notes/tags-view";

/**
 * GET /api/tree/tags?root=<folder>&root=<folder>
 *
 * The Tags view for one or more top-level folders: the user's #tags counted
 * within them, study-map topics with their files, and what isn't tagged yet.
 */
export const GET = withErrorHandler(async (request) => {
  const user = await requireAuth();
  const roots = new URL(request.url).searchParams.getAll("root");
  if (roots.length === 0) throw new ApiError(400, "Choose at least one folder");
  if (roots.length > MAX_TAGS_VIEW_ROOTS) throw new ApiError(400, "Too many folders");
  const data = await readTagsView(
    user.user_id,
    roots.map((root) => requireValidId(root, "folder ID")),
  );
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
});
