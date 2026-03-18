// trash API route - restore and permanently delete notes
import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import {
    getNoteFromS3,
    restoreNoteFromTrash,
    permanentlyDeleteNote,
    getTrashFromS3,
} from '@/lib/notes/storage/s3-storage';

interface TrashAction {
    action: 'restore' | 'delete' | 'list';
    data?: {
        id?: string;
        parentId?: string;
    };
}

export async function GET() {
    try {
        const user = await validateSession();
        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const trash = await getTrashFromS3();
        return NextResponse.json({ items: trash });
    } catch (error) {
        console.error('[trash] GET error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch trash' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = await validateSession();
        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const body: TrashAction = await request.json();

        if (!body.action || (body.action !== 'list' && !body.data?.id)) {
            return NextResponse.json(
                { error: 'Missing action or data.id' },
                { status: 400 }
            );
        }

        const { id, parentId } = body.data || {};

        switch (body.action) {
            case 'list': {
                const trash = await getTrashFromS3();
                return NextResponse.json({ items: trash });
            }

            case 'restore': {
                if (!id) {
                    return NextResponse.json(
                        { error: 'Missing note id' },
                        { status: 400 }
                    );
                }
                const note = await getNoteFromS3(id);
                if (!note) {
                    return NextResponse.json(
                        { error: 'Note not found' },
                        { status: 404 }
                    );
                }
                await restoreNoteFromTrash(id);
                return NextResponse.json({ success: true });
            }

            case 'delete': {
                if (!id) {
                    return NextResponse.json(
                        { error: 'Missing note id' },
                        { status: 400 }
                    );
                }
                const note = await getNoteFromS3(id);
                if (!note) {
                    return NextResponse.json(
                        { error: 'Note not found' },
                        { status: 404 }
                    );
                }
                await permanentlyDeleteNote(id);
                return NextResponse.json({ success: true });
            }

            default:
                return NextResponse.json(
                    { error: `Unknown action: ${body.action}` },
                    { status: 400 }
                );
        }
    } catch (error) {
        console.error('[trash] POST error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
