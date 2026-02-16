// trash API route - restore and permanently delete notes
import { NextRequest, NextResponse } from 'next/server';
import { NOTE_DELETED } from '@/lib/notes/types/meta';
import {
    MOCK_NOTES_STORAGE,
    addNoteToTree,
    removeNoteFromTree,
} from '@/lib/notes/storage/mock-storage';

interface TrashAction {
    action: 'restore' | 'delete';
    data: {
        id: string;
        parentId?: string;
    };
}

export async function POST(request: NextRequest) {
    try {
        const body: TrashAction = await request.json();

        if (!body.action || !body.data?.id) {
            return NextResponse.json(
                { error: 'Missing action or data.id' },
                { status: 400 }
            );
        }

        const { id, parentId } = body.data;

        switch (body.action) {
            case 'restore': {
                const note = MOCK_NOTES_STORAGE.get(id);
                if (!note) {
                    return NextResponse.json(
                        { error: 'Note not found' },
                        { status: 404 }
                    );
                }
                note.deleted = NOTE_DELETED.NORMAL;
                if (parentId) note.pid = parentId;
                MOCK_NOTES_STORAGE.set(id, note);
                addNoteToTree(id, parentId || note.pid);
                return NextResponse.json({ success: true });
            }

            case 'delete': {
                if (!MOCK_NOTES_STORAGE.has(id)) {
                    return NextResponse.json(
                        { error: 'Note not found' },
                        { status: 404 }
                    );
                }
                MOCK_NOTES_STORAGE.delete(id);
                removeNoteFromTree(id);
                return NextResponse.json({ success: true });
            }

            default:
                return NextResponse.json(
                    { error: `Unknown action: ${body.action}` },
                    { status: 400 }
                );
        }
    } catch (error) {
        console.error('[trash] error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
