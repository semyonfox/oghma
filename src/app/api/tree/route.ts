import { NextResponse } from 'next/server';
import {
    MOCK_TREE_STORAGE,
    syncTreeWithNotes,
} from '@/lib/notes/storage/mock-storage';
import { ROOT_ID } from '@/lib/notes/types/tree';

export async function GET() {
    syncTreeWithNotes();
    return NextResponse.json(MOCK_TREE_STORAGE);
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
