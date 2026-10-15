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
import { parseTreeMutation } from "@/lib/notes/tree-mutation";

export const POST = withErrorHandler(async (request) => {
  const user = await requireAuth();
  const mutation = parseTreeMutation(await parseJsonObject(request));

  if (mutation.action === "mutate") {
    const { id, isExpanded } = mutation.data;
    requireValidId(id, "item ID");
    try {
      await updateTreeItem(user.user_id, id, { isExpanded });
    } catch (error) {
      if (error instanceof TreeItemUnavailableError) {
        throw new ApiError(404, error.message);
      }
      throw error;
    }
    return NextResponse.json({ success: true });
  }

  const { noteId, expectedParentId, parentId } = mutation.data;
  requireValidId(noteId, "note ID");
  if (expectedParentId) requireValidId(expectedParentId, "expected parent ID");
  if (parentId) requireValidId(parentId, "parent ID");

  try {
    const result = await moveNoteInTree(
      user.user_id,
      noteId,
      parentId,
      expectedParentId,
    );
    return NextResponse.json(result);
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
});
