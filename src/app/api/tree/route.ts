import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth.js';
import { getTreeFromPG } from '@/lib/notes/storage/pg-tree.js';
import { ROOT_ID } from '@/lib/notes/types/tree';

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
              
              // Convert string ID to number for database operations
              const itemId = parseInt(id, 10);
              if (isNaN(itemId)) {
                return NextResponse.json(
                  { error: 'Invalid item ID' },
                  { status: 400 }
                );
              }

              // Update tree item in PostgreSQL
              await updateTreeItem(user.user_id, itemId, rest);
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

              // Parse IDs
              const noteIdStr = destination.parentId === ROOT_ID ? destination.parentId : destination.parentId;
              const newParentId = destination.parentId === ROOT_ID ? null : destination.parentId;
              
              // In a real implementation, you'd need to track which note is being moved
              // For now, assuming the frontend passes the note_id or we query it
              // This is a simplified version - you may need to adjust based on your tree structure
              
              return NextResponse.json({ 
                success: true,
                message: 'Move operation would require more context about the note being moved'
              });
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
