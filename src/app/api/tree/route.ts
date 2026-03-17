import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth.js';
import { getTreeFromPG } from '@/lib/notes/storage/pg-tree.js';
import { ROOT_ID } from '@/lib/notes/types/tree';
import { isValidUUID } from '@/lib/uuid-validation.js';
import sql from '@/database/pgsql.js';

/**
 * GET /api/tree
 * 
 * Lazy-loading root endpoint. Returns root items only (not full tree).
 * Delegates to /api/tree/children internally for consistency.
 */
export async function GET(request: Request) {
    try {
      const user = await validateSession();
      if (!user) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }

      // Fetch root items (parent_id IS NULL), sorted A-Z by title
      const rows = await sql`
        SELECT 
          ti.note_id,
          n.title,
          n.is_folder,
          ti.is_expanded
        FROM app.tree_items ti
        JOIN app.notes n ON ti.note_id = n.note_id
        WHERE ti.user_id = ${user.user_id}::uuid
          AND ti.parent_id IS NULL
          AND n.deleted = 0 
          AND n.deleted_at IS NULL
        ORDER BY n.title ASC
      `;

      return NextResponse.json({
        parentId: 'root',
        items: rows.map(row => ({
          id: row.note_id,
          title: row.title,
          isFolder: row.is_folder,
          isExpanded: row.is_expanded,
        })),
      });
    } catch (error) {
      console.error('Tree GET error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch tree' },
        { status: 500 }
      );
    }
}

interface TreeMutateAction {
    action: 'move' | 'mutate';
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
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }

      const body: TreeMutateAction = await request.json();
      const { updateTreeItem, moveNoteInTree } = await import('@/lib/notes/storage/pg-tree.js');

      switch (body.action) {
          case 'mutate': {
              const { id, ...rest } = body.data;
              if (!id) {
                  return NextResponse.json({ success: true });
              }
              
              // Validate item ID is a valid UUID
              if (!isValidUUID(id)) {
                return NextResponse.json(
                  { error: 'Invalid item ID format' },
                  { status: 400 }
                );
              }

              // Update tree item in PostgreSQL
              await updateTreeItem(user.user_id, id, rest);
              return NextResponse.json({ success: true });
          }

          case 'move': {
              const { source, destination } = body.data;
              if (!source || !destination) {
                  return NextResponse.json(
                      { error: 'Missing source or destination' },
                      { status: 400 }
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
                      { error: 'Invalid source position' },
                      { status: 400 }
                  );
              }
              
              const noteId = sourceParentItem.children[sourceIndex];
              
              // Validate note ID
              if (!isValidUUID(noteId)) {
                  return NextResponse.json(
                      { error: 'Invalid note ID' },
                      { status: 400 }
                  );
              }
              
              // Determine new parent ID (null if moving to root)
              const newParentId = destination.parentId === ROOT_ID ? null : destination.parentId;
              if (newParentId && !isValidUUID(newParentId)) {
                  return NextResponse.json(
                      { error: 'Invalid parent ID' },
                      { status: 400 }
                  );
              }
              
              // Move the note in the tree (position stored separately if needed)
              await moveNoteInTree(user.user_id, noteId, newParentId);
              
              return NextResponse.json({ success: true });
          }

          default:
              return NextResponse.json({ success: true });
      }
    } catch (error) {
      console.error('Tree POST error:', error);
      return NextResponse.json(
        { error: 'Failed to update tree' },
        { status: 500 }
      );
    }
}
