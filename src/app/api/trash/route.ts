// trash API route - restore and permanently delete soft-deleted notes
import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { isValidUUID } from '@/lib/uuid-validation';
import sql from '@/database/pgsql';
import { addNoteToTree } from '@/lib/notes/storage/pg-tree.js';
import logger from '@/lib/logger';

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

        // Fetch soft-deleted notes for this user from PostgreSQL
        const trash = await sql`
            SELECT note_id, title, content, is_folder, deleted_at, created_at, updated_at
            FROM app.notes
            WHERE user_id = ${user.user_id}::uuid AND deleted = 1
            ORDER BY deleted_at DESC
        `;

        // Map to response format
        const items = trash.map(note => ({
            id: note.note_id,
            title: note.title,
            content: note.content,
            isFolder: note.is_folder,
            deletedAt: note.deleted_at ? new Date(note.deleted_at).toISOString() : null,
            createdAt: note.created_at ? new Date(note.created_at).toISOString() : undefined,
            updatedAt: note.updated_at ? new Date(note.updated_at).toISOString() : undefined,
        }));

        return NextResponse.json({ items });
    } catch (error) {
        logger.error('trash GET error', { error });
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

        const { id } = body.data || {};

        switch (body.action) {
            case 'list': {
                // Fetch soft-deleted notes for this user
                const trash = await sql`
                    SELECT note_id, title, content, is_folder, deleted_at, created_at, updated_at
                    FROM app.notes
                    WHERE user_id = ${user.user_id}::uuid AND deleted = 1
                    ORDER BY deleted_at DESC
                `;

                const items = trash.map(note => ({
                    id: note.note_id,
                    title: note.title,
                    content: note.content,
                    isFolder: note.is_folder,
                    deletedAt: note.deleted_at ? new Date(note.deleted_at).toISOString() : null,
                    createdAt: note.created_at ? new Date(note.created_at).toISOString() : undefined,
                    updatedAt: note.updated_at ? new Date(note.updated_at).toISOString() : undefined,
                }));

                return NextResponse.json({ items });
            }

            case 'restore': {
                if (!id || !isValidUUID(id)) {
                    return NextResponse.json(
                        { error: 'Missing or invalid note id' },
                        { status: 400 }
                    );
                }

                // Verify note exists and belongs to user
                const note = await sql`
                    SELECT note_id FROM app.notes
                    WHERE note_id = ${id}::uuid AND user_id = ${user.user_id}::uuid AND deleted = 1
                `;

                if (note.length === 0) {
                    return NextResponse.json(
                        { error: 'Note not found in trash' },
                        { status: 404 }
                    );
                }

                // Restore note (unset deleted flag) and re-add to tree root
                await sql`
                    UPDATE app.notes
                    SET deleted = 0, deleted_at = NULL, updated_at = NOW()
                    WHERE note_id = ${id}::uuid AND user_id = ${user.user_id}::uuid
                `;

                await addNoteToTree(user.user_id, id, null);

                return NextResponse.json({ success: true });
            }

            case 'delete': {
                if (!id || !isValidUUID(id)) {
                    return NextResponse.json(
                        { error: 'Missing or invalid note id' },
                        { status: 400 }
                    );
                }

                // Verify note exists and belongs to user
                const note = await sql`
                    SELECT note_id FROM app.notes
                    WHERE note_id = ${id}::uuid AND user_id = ${user.user_id}::uuid AND deleted = 1
                `;

                if (note.length === 0) {
                    return NextResponse.json(
                        { error: 'Note not found in trash' },
                        { status: 404 }
                    );
                }

                // Permanently delete note and all related data
                await sql`
                    DELETE FROM app.pdf_annotations
                    WHERE note_id = ${id}::uuid AND user_id = ${user.user_id}::uuid
                `;

                await sql`
                    DELETE FROM app.attachments
                    WHERE note_id = ${id}::uuid AND user_id = ${user.user_id}::uuid
                `;

                await sql`
                    DELETE FROM app.notes
                    WHERE note_id = ${id}::uuid AND user_id = ${user.user_id}::uuid
                `;

                return NextResponse.json({ success: true });
            }

            default:
                return NextResponse.json(
                    { error: `Unknown action: ${body.action}` },
                    { status: 400 }
                );
        }
    } catch (error) {
        logger.error('trash POST error', { error });
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
