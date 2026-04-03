import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth.js";
import { getTreeFromPG } from "@/lib/notes/storage/pg-tree.js";
import { ROOT_ID } from "@/lib/notes/types/tree";
import { isValidUUID } from "@/lib/utils/uuid";
import { cacheInvalidate, cacheKeys } from "@/lib/cache";
import logger from "@/lib/logger";

interface TreeMutateAction {
  action: "move" | "mutate";
  data: {
    id?: string;
    isExpanded?: boolean;
    source?: { parentId: string; index: number };
    destination?: { parentId: string; index?: number };
  };
}

export async function POST(request: Request) {
  try {
    // Get authenticated user
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: TreeMutateAction = await request.json();
    const { updateTreeItem, moveNoteInTree } =
      await import("@/lib/notes/storage/pg-tree.js");

    switch (body.action) {
      case "mutate": {
        const { id, ...rest } = body.data;
        if (!id) {
          return NextResponse.json({ success: true });
        }

        // Validate item ID is a valid UUID
        if (!isValidUUID(id)) {
          return NextResponse.json(
            { error: "Invalid item ID format" },
            { status: 400 },
          );
        }

        // Update tree item in PostgreSQL
        await updateTreeItem(user.user_id, id, rest);
        await cacheInvalidate(cacheKeys.treeFull(user.user_id));
        return NextResponse.json({ success: true });
      }

      case "move": {
        const { source, destination } = body.data;
        if (!source || !destination) {
          return NextResponse.json(
            { error: "Missing source or destination" },
            { status: 400 },
          );
        }

        // Get the tree to find the note_id being moved
        const tree = await getTreeFromPG(user.user_id);
        const sourceParentId = source.parentId;
        const sourceIndex = source.index;

        // Get the item being moved from the source parent
        const sourceParentItem = tree.items[sourceParentId];
        if (!sourceParentItem || !sourceParentItem.children[sourceIndex]) {
          return NextResponse.json(
            { error: "Invalid source position" },
            { status: 400 },
          );
        }

        const noteId = sourceParentItem.children[sourceIndex];

        // Validate note ID
        if (!isValidUUID(noteId)) {
          return NextResponse.json(
            { error: "Invalid note ID" },
            { status: 400 },
          );
        }

        // Determine new parent ID (null if moving to root)
        const newParentId =
          destination.parentId === ROOT_ID ? null : destination.parentId;
        if (newParentId && !isValidUUID(newParentId)) {
          return NextResponse.json(
            { error: "Invalid parent ID" },
            { status: 400 },
          );
        }

        // Move the note in the tree (position stored separately if needed)
        await moveNoteInTree(user.user_id, noteId, newParentId);

        await cacheInvalidate(
          cacheKeys.treeChildren(
            user.user_id,
            source.parentId === ROOT_ID ? null : source.parentId,
          ),
          cacheKeys.treeChildren(user.user_id, newParentId),
          cacheKeys.treeFull(user.user_id),
        );

        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ success: true });
    }
  } catch (error) {
    logger.error("tree POST error", { error });
    return NextResponse.json(
      { error: "Failed to update tree" },
      { status: 500 },
    );
  }
}
