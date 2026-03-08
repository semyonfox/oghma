import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth.js';
import { getTreeFromPG } from '@/lib/notes/storage/pg-tree.js';
import { ROOT_ID } from '@/lib/notes/types/tree';
import { isValidUUID } from '@/lib/uuid-validation.js';

/**
 * Helper: Filter tree item to only include requested fields
 */
function filterTreeItemFields(item: any, fields?: string[]): any {
  if (!fields || fields.length === 0) {
    return item;
  }
  
  const filtered: any = {};
  for (const field of fields) {
    if (field in item) {
      filtered[field] = item[field];
    }
  }
  return filtered;
}

export async function GET(request: Request) {
    try {
      // Get authenticated user
      const user = await validateSession();
      if (!user) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }

      // Fetch tree from PostgreSQL (per-user)
      const tree = await getTreeFromPG(user.user_id);
      
      // Parse query parameters
      const url = new URL(request.url);
      const fieldsParam = url.searchParams.get('fields');
      const skipParam = url.searchParams.get('skip');
      const limitParam = url.searchParams.get('limit');
      
      // Parse fields from comma-separated string
      const fields = fieldsParam ? fieldsParam.split(',').map(f => f.trim()) : undefined;
      
      // Parse pagination
      const skip = skipParam ? parseInt(skipParam, 10) : 0;
      const limit = limitParam ? parseInt(limitParam, 10) : undefined;
      
      // Get all tree items
      let items = Object.entries(tree.items);
      
      // Apply pagination
      if (skip > 0 || limit) {
        const end = limit ? skip + limit : undefined;
        items = items.slice(skip, end);
      }
      
      // Build filtered result
      const filteredTree = {
        rootId: tree.rootId,
        items: Object.fromEntries(
          items.map(([id, item]) => [id, filterTreeItemFields(item, fields)])
        ),
      };
      
      return NextResponse.json(filteredTree);
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
              
              // Move the note in the tree with new position
              const newPosition = destination.index ?? undefined;
              await moveNoteInTree(user.user_id, noteId, newParentId, newPosition);
              
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
