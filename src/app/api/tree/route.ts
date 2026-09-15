import { NextResponse } from "next/server";
import {
  ApiError,
  parseJsonObject,
  requireAuth,
  requireValidId,
  withErrorHandler,
} from "@/lib/api-error";
import {
  moveNoteInTree,
  TreeCycleError,
  TreeItemUnavailableError,
  TreeMoveConflictError,
  TreeParentError,
  updateTreeItem,
} from "@/lib/notes/storage/pg-tree";
import {
  type TreeMutationRequest,
} from "@/lib/notes/types/tree";
import { cacheInvalidate, cacheKeys } from "@/lib/cache";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Parse the only two mutations the tree API persists. */
export function parseTreeMutation(
  body: Record<string, unknown>,
): TreeMutationRequest {
  const data = body.data;
  if (!isRecord(data)) {
    throw new ApiError(400, "Tree mutation data is required");
  }

  if (body.action === "mutate") {
    if (
      typeof data.id !== "string" ||
      typeof data.isExpanded !== "boolean"
    ) {
      throw new ApiError(400, "Invalid tree item mutation");
    }
    return {
      action: "mutate",
      data: { id: data.id, isExpanded: data.isExpanded },
    };
  }

  if (body.action === "move") {
    if (
      typeof data.noteId !== "string" ||
      (data.expectedParentId !== null &&
        typeof data.expectedParentId !== "string") ||
      (data.parentId !== null && typeof data.parentId !== "string")
    ) {
      throw new ApiError(400, "Invalid tree move");
    }
    return {
      action: "move",
      data: {
        noteId: data.noteId,
        expectedParentId: data.expectedParentId,
        parentId: data.parentId,
      },
    };
  }

  throw new ApiError(400, "Unsupported tree mutation");
}

export const POST = withErrorHandler(async (request) => {
  const user = await requireAuth();
  const mutation = parseTreeMutation(await parseJsonObject(request));

  if (mutation.action === "mutate") {
    const { id, isExpanded } = mutation.data;
    requireValidId(id, "item ID");
    const parentId = await updateTreeItem(user.user_id, id, { isExpanded });

    await cacheInvalidate(
      cacheKeys.treeChildren(user.user_id, parentId),
      cacheKeys.treeFull(user.user_id),
    );
    return NextResponse.json({ success: true });
  }

  const { noteId, expectedParentId, parentId } = mutation.data;
  requireValidId(noteId, "note ID");
  if (expectedParentId) requireValidId(expectedParentId, "expected parent ID");
  if (parentId) requireValidId(parentId, "parent ID");

  let result;
  try {
    result = await moveNoteInTree(
      user.user_id,
      noteId,
      parentId,
      expectedParentId,
    );
  } catch (error) {
    if (error instanceof TreeCycleError) {
      throw new ApiError(400, error.message);
    }
    if (error instanceof TreeParentError) {
      throw new ApiError(400, error.message);
    }
    if (error instanceof TreeItemUnavailableError) {
      throw new ApiError(404, error.message);
    }
    if (error instanceof TreeMoveConflictError) {
      throw new ApiError(409, error.message);
    }
    throw error;
  }

  await cacheInvalidate(
    cacheKeys.treeChildren(user.user_id, result.oldParentId),
    cacheKeys.treeChildren(user.user_id, result.newParentId),
    cacheKeys.treeFull(user.user_id),
  );

  return NextResponse.json(result);
});
