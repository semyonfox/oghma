import { NextRequest, NextResponse } from "next/server";
import {
  ApiError,
  requireAuth,
  requireValidId,
  withErrorHandler,
} from "@/lib/api-error";
import {
  emptyTrash,
  listTrashRoots,
  permanentlyDeleteTrashRoot,
  restoreTrashRoot,
} from "@/lib/notes/storage/note-lifecycle";

type TrashAction = "restore" | "delete" | "empty" | "list";

function requestId(body: Record<string, unknown>): unknown {
  if (body.id) return body.id;
  const data = body.data;
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>).id
    : undefined;
}

/** List deleted roots, not every descendant in a deleted folder bundle. */
export const GET = withErrorHandler(async () => {
  const user = await requireAuth();
  const items = await listTrashRoots(user.user_id);
  return NextResponse.json({ items });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const user = await requireAuth();
  let body: Record<string, unknown>;
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new ApiError(400, "Invalid Trash request");
    }
    body = value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "Invalid Trash request");
  }

  const action = body.action as TrashAction | undefined;
  if (!action) throw new ApiError(400, "Missing Trash action");

  if (action === "list") {
    return NextResponse.json({ items: await listTrashRoots(user.user_id) });
  }

  if (action === "empty") {
    const deletedRoots = await emptyTrash(user.user_id);
    return NextResponse.json({ success: true, deletedRoots });
  }

  if (action !== "restore" && action !== "delete") {
    throw new ApiError(400, "Unknown Trash action");
  }

  const rootId = requireValidId(requestId(body), "Trash item ID");
  if (action === "restore") {
    const result = await restoreTrashRoot(user.user_id, rootId);
    if (!result) throw new ApiError(404, "Trash item not found");
    return NextResponse.json({
      success: true,
      rootId: result.rootId,
      itemsRestored: result.noteIds.length,
    });
  }

  const result = await permanentlyDeleteTrashRoot(user.user_id, rootId);
  if (!result) throw new ApiError(404, "Trash item not found");
  return NextResponse.json({
    success: true,
    rootId,
    itemsDeleted: result.noteIds.length,
    cleanupPending: Boolean(result.cleanupTaskId),
  });
});
