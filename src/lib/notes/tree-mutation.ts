import { ApiError } from "@/lib/api-error";
import type { TreeMutationRequest } from "@/lib/notes/types/tree";

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
