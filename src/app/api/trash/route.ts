// trash API route - restore and permanently delete soft-deleted notes
import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { isValidUUID } from '@/lib/uuid-validation';
import { getStorageProvider } from '@/lib/storage/init';
import sql from '@/database/pgsql';
import { addNoteToTree } from '@/lib/notes/storage/pg-tree.js';
import logger from '@/lib/logger';

async function fetchTrashItems(userId: string) {
    const rows = await sql`
        SELECT note_id, title, content, is_folder, deleted_at, created_at, updated_at
        FROM app.notes
        WHERE user_id = ${userId}::uuid AND deleted = 1
        ORDER BY deleted_at DESC
    `;
    return rows.map(note => ({
        id: note.note_id,
        title: note.title,
        content: note.content,
        isFolder: note.is_folder,
        deletedAt: note.deleted_at ? new Date(note.deleted_at).toISOString() : null,
        createdAt: note.created_at ? new Date(note.created_at).toISOString() : undefined,
        updatedAt: note.updated_at ? new Date(note.updated_at).toISOString() : undefined,
    }));
}

async function requireNoteInTrash(userId: string, id: string): Promise<boolean> {
    const rows = await sql`
        SELECT note_id FROM app.notes
        WHERE note_id = ${id}::uuid AND user_id = ${userId}::uuid AND deleted = 1
    `;
    return rows.length > 0;
}

export async function GET() {
    try {
        const user = await validateSession();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const items = await fetchTrashItems(user.user_id);
        return NextResponse.json({ items });
    } catch (error) {
        logger.error('trash GET error', { error });
        return NextResponse.json({ error: 'Failed to fetch trash' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = await validateSession();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body: { action: string; data?: { id?: string } } = await request.json();
        if (!body.action) {
            return NextResponse.json({ error: 'Missing action' }, { status: 400 });
        }

        const id = body.data?.id;

        if (body.action === 'list') {
            const items = await fetchTrashItems(user.user_id);
            return NextResponse.json({ items });
        }

        if (!id || !isValidUUID(id)) {
            return NextResponse.json({ error: 'Missing or invalid note id' }, { status: 400 });
        }

        const exists = await requireNoteInTrash(user.user_id, id);
        if (!exists) return NextResponse.json({ error: 'Note not found in trash' }, { status: 404 });

        if (body.action === 'restore') {
            await sql`
                UPDATE app.notes
                SET deleted = 0, deleted_at = NULL, updated_at = NOW()
                WHERE note_id = ${id}::uuid AND user_id = ${user.user_id}::uuid
            `;
            await addNoteToTree(user.user_id, id, null);
            return NextResponse.json({ success: true });
        }

        if (body.action === 'delete') {
            // clean S3 objects before removing DB rows (best-effort)
            const storage = getStorageProvider();
            const s3Rows = await sql`
                SELECT s3_key FROM app.notes WHERE note_id = ${id}::uuid AND s3_key IS NOT NULL
                UNION ALL
                SELECT s3_key FROM app.attachments WHERE note_id = ${id}::uuid AND s3_key IS NOT NULL
            `;
            await Promise.all(s3Rows.map(async (r: { s3_key: string }) => {
                try { await storage.deleteObject(r.s3_key); }
                catch (err) { logger.warn('S3 delete failed', { key: r.s3_key, err }); }
            }));

            await sql`DELETE FROM app.pdf_annotations WHERE note_id = ${id}::uuid AND user_id = ${user.user_id}::uuid`;
            await sql`DELETE FROM app.attachments WHERE note_id = ${id}::uuid AND user_id = ${user.user_id}::uuid`;
            await sql`DELETE FROM app.notes WHERE note_id = ${id}::uuid AND user_id = ${user.user_id}::uuid`;
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
    } catch (error) {
        logger.error('trash POST error', { error });
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
