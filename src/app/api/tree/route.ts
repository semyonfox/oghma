import { NextResponse } from "next/server";
import {
  ApiError,
  parseJsonObject,
  requireAuth,
  requireValidId,
  withErrorHandler,
} from "@/lib/api-error";
import {
  getTreeFromPG,
  moveNoteInTree,
  TreeCycleError,
  TreeItemUnavailableError,
  TreeParentError,
  updateTreeItem,
} from "@/lib/notes/storage/pg-tree";
import {
  ROOT_ID,
  type TreeMovePosition,
  type TreeMutationRequest,
} from "@/lib/notes/types/tree";
import { cacheInvalidate, cacheKeys } from "@/lib/cache";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parsePosition(
  value: unknown,
  fieldName: "source" | "destination",
): TreeMovePosition {
  const parentId = isRecord(value) ? value.parentId : undefined;
  const index = isRecord(value) ? value.index : undefined;
  if (
    typeof parentId !== "string" ||
    typeof index !== "number" ||
    !Number.isInteger(index) ||
    index < 0
  ) {
    throw new ApiError(400, `Invalid ${fieldName} position`);
  }

  return { parentId, index };
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
    return {
      action: "move",
      data: {
        source: parsePosition(data.source, "source"),
        destination: parsePosition(data.destination, "destination"),
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

  const { source, destination } = mutation.data;
  const tree = await getTreeFromPG(user.user_id);
  const sourceParent = tree.items[source.parentId];
  const noteId = sourceParent?.children[source.index];
  if (!noteId) throw new ApiError(400, "Invalid source position");

  requireValidId(noteId, "note ID");
  if (source.parentId !== ROOT_ID) requireValidId(source.parentId, "source parent ID");

  const newParentId = destination.parentId === ROOT_ID ? null : destination.parentId;
  if (newParentId) requireValidId(newParentId, "parent ID");

  try {
    await moveNoteInTree(user.user_id, noteId, newParentId);
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
    throw error;
  }

  await cacheInvalidate(
    cacheKeys.treeChildren(
      user.user_id,
      source.parentId === ROOT_ID ? null : source.parentId,
    ),
    cacheKeys.treeChildren(user.user_id, newParentId),
    cacheKeys.treeFull(user.user_id),
  );

  return NextResponse.json({ success: true });
});
