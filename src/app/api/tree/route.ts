import { NextResponse } from 'next/server';
import {
    MOCK_TREE_STORAGE,
    syncTreeWithNotes,
} from '@/lib/notes/storage/mock-storage';
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
    syncTreeWithNotes();
    
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
    let items = Object.entries(MOCK_TREE_STORAGE.items);
    
    // Apply pagination
    if (skip > 0 || limit) {
      const end = limit ? skip + limit : undefined;
      items = items.slice(skip, end);
    }
    
    // Build filtered result
    const filteredTree = {
      rootId: MOCK_TREE_STORAGE.rootId,
      items: Object.fromEntries(
        items.map(([id, item]) => [id, filterTreeItemFields(item, fields)])
      ),
    };
    
    return NextResponse.json(filteredTree);
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
    const body: TreeMutateAction = await request.json();

    switch (body.action) {
        case 'mutate': {
            const { id, ...rest } = body.data;
            if (!id || !MOCK_TREE_STORAGE.items[id]) {
                return NextResponse.json({ success: true });
            }
            // apply expand/collapse and other tree item properties
            Object.assign(MOCK_TREE_STORAGE.items[id], rest);
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

            const srcParent = MOCK_TREE_STORAGE.items[source.parentId];
            const dstParent = MOCK_TREE_STORAGE.items[destination.parentId];
            if (!srcParent || !dstParent) {
                return NextResponse.json(
                    { error: 'Parent not found' },
                    { status: 404 }
                );
            }

            // remove from source
            const [movedId] = srcParent.children.splice(source.index, 1);
            if (!movedId) {
                return NextResponse.json({ success: true });
            }

            // insert at destination
            const dstIndex = destination.index ?? dstParent.children.length;
            dstParent.children.splice(dstIndex, 0, movedId);

            // update note pid
            const item = MOCK_TREE_STORAGE.items[movedId];
            if (item?.data) {
                item.data.pid = destination.parentId === ROOT_ID
                    ? undefined
                    : destination.parentId;
            }

            return NextResponse.json({ success: true });
        }

        default:
            return NextResponse.json({ success: true });
    }
}
