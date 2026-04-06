import { NextResponse } from 'next/server';
import { withErrorHandler, requireAuth, requireValidId, ApiError } from '@/lib/api-error';
import { getTreeFromPG } from '@/lib/notes/storage/pg-tree.js';
import { ROOT_ID } from '@/lib/notes/types/tree';
import { cacheInvalidate, cacheKeys } from '@/lib/cache';

interface TreeMutateAction {
    action: 'move' | 'mutate';
    data: {
        id?: string;
        isExpanded?: boolean;
        source?: { parentId: string; index: number };
        destination?: { parentId: string; index?: number };
    };
}

export const POST = withErrorHandler(async (request) => {
      const user = await requireAuth();

      const body: TreeMutateAction = await request.json();
      const { updateTreeItem, moveNoteInTree } = await import('@/lib/notes/storage/pg-tree.js');

      switch (body.action) {
          case 'mutate': {
              const { id, ...rest } = body.data;
              if (!id) {
                  return NextResponse.json({ success: true });
              }

              // validate item ID
              requireValidId(id, "item ID");

              // Update tree item in PostgreSQL
              await updateTreeItem(user.user_id, id, rest);
              await cacheInvalidate(cacheKeys.treeFull(user.user_id));
              return NextResponse.json({ success: true });
          }

          case 'move': {
              const { source, destination } = body.data;
              if (!source || !destination) {
                  throw new ApiError(400, 'Missing source or destination');
              }

              // Get the tree to find the note_id being moved
              const tree = await getTreeFromPG(user.user_id);
              const sourceParentId = source.parentId;
              const sourceIndex = source.index;

              // Get the item being moved from the source parent
              const sourceParentItem = tree.items[sourceParentId];
              if (!sourceParentItem || !sourceParentItem.children[sourceIndex]) {
                  throw new ApiError(400, 'Invalid source position');
              }

              const noteId = sourceParentItem.children[sourceIndex];

              // validate note ID
              requireValidId(noteId, "note ID");

              // Determine new parent ID (null if moving to root)
              const newParentId = destination.parentId === ROOT_ID ? null : destination.parentId;
              if (newParentId) requireValidId(newParentId, "parent ID");

              // Move the note in the tree (position stored separately if needed)
              await moveNoteInTree(user.user_id, noteId, newParentId);

              await cacheInvalidate(
                cacheKeys.treeChildren(user.user_id, source.parentId === ROOT_ID ? null : source.parentId),
                cacheKeys.treeChildren(user.user_id, newParentId),
                cacheKeys.treeFull(user.user_id),
              );

              return NextResponse.json({ success: true });
          }

          default:
              return NextResponse.json({ success: true });
      }
});
