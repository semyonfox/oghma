// trash API route - restore and permanently delete soft-deleted notes
import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { isValidUUID } from '@/lib/utils/uuid';
import { withErrorHandler, tracedError } from '@/lib/api-error';
import sql from '@/database/pgsql';
import { addNoteToTree } from '@/lib/notes/storage/pg-tree.js';
import { cleanupNoteDependencies } from '@/lib/notes/storage/note-cleanup';
import logger from '@/lib/logger';

async function fetchTrashItems(userId: string) {
    const rows = await sql`
        SELECT note_id, title, is_folder, deleted_at, created_at, updated_at
        FROM app.notes
        WHERE user_id = ${userId}::uuid AND deleted_at IS NOT NULL
        ORDER BY deleted_at DESC
    `;
    return rows.map((note: { note_id: string; title: string; is_folder: boolean; deleted_at: string | null; created_at: string | null; updated_at: string | null }) => ({
        id: note.note_id,
        title: note.title,
        isFolder: note.is_folder,
        deletedAt: note.deleted_at ? new Date(note.deleted_at).toISOString() : null,
        createdAt: note.created_at ? new Date(note.created_at).toISOString() : undefined,
        updatedAt: note.updated_at ? new Date(note.updated_at).toISOString() : undefined,
    }));
}

async function requireNoteInTrash(userId: string, id: string): Promise<boolean> {
    const rows = await sql`
        SELECT note_id FROM app.notes
        WHERE note_id = ${id}::uuid AND user_id = ${userId}::uuid AND deleted_at IS NOT NULL
    `;
    return rows.length > 0;
}

export const GET = withErrorHandler(async () => {
    try {
        const user = await validateSession();
        if (!user) return tracedError('Unauthorized', 401);
        const items = await fetchTrashItems(user.user_id);
        return NextResponse.json({ items });
    } catch (error) {
        logger.error('trash GET error', { error });
        return tracedError('Failed to fetch trash', 500);
    }
});

export const POST = withErrorHandler(async (request: NextRequest) => {
    try {
        const user = await validateSession();
        if (!user) return tracedError('Unauthorized', 401);

        const body: { action: string; data?: { id?: string } } = await request.json();
        if (!body.action) {
            return tracedError('Missing action', 400);
        }

        const id = body.data?.id;

        if (body.action === 'list') {
            const items = await fetchTrashItems(user.user_id);
            return NextResponse.json({ items });
        }

        if (!id || !isValidUUID(id)) {
            return tracedError('Missing or invalid note id', 400);
        }

        const exists = await requireNoteInTrash(user.user_id, id);
        if (!exists) return tracedError('Note not found in trash', 404);

        if (body.action === 'restore') {
            await sql`
                UPDATE app.notes
                SET deleted_at = NULL, updated_at = NOW()
                WHERE note_id = ${id}::uuid AND user_id = ${user.user_id}::uuid
            `;
            await addNoteToTree(user.user_id, id, null);
            return NextResponse.json({ success: true });
        }

        if (body.action === 'delete') {
            await cleanupNoteDependencies(user.user_id, id);
            await sql`DELETE FROM app.notes WHERE note_id = ${id}::uuid AND user_id = ${user.user_id}::uuid`;
            return NextResponse.json({ success: true });
        }

        return tracedError(`Unknown action: ${body.action}`, 400);
    } catch (error) {
        logger.error('trash POST error', { error });
        return tracedError('Internal server error', 500);
    }
});
