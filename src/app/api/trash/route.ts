import { NextRequest, NextResponse } from "next/server";
import {
  ApiError,
  parseJsonObject,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requestId(body: Record<string, unknown>): unknown {
  if (body.id) return body.id;
  const data = body.data;
  return isRecord(data)
    ? data.id
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
    body = await parseJsonObject(request);
  } catch {
    throw new ApiError(400, "Invalid Trash request");
  }

  const action = body.action;
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
    const expectedDeletedAt = body.expectedDeletedAt;
    if (expectedDeletedAt !== undefined && (typeof expectedDeletedAt !== "string" || !Number.isFinite(Date.parse(expectedDeletedAt)) || new Date(expectedDeletedAt).toISOString() !== expectedDeletedAt)) {
      throw new ApiError(400, "Invalid Trash confirmation");
    }
    const result = expectedDeletedAt === undefined
      ? await restoreTrashRoot(user.user_id, rootId)
      : await restoreTrashRoot(user.user_id, rootId, expectedDeletedAt);
    if (!result) throw new ApiError(expectedDeletedAt ? 409 : 404, "Trash item changed or was not found");
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
