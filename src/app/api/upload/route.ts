// upload API route - handles file uploads for note attachments
import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimiter';
import { getStorageProvider } from '@/lib/storage/init';
import { isValidUUID } from '@/lib/uuid-validation';
import { addNoteToTree } from '@/lib/notes/storage/pg-tree.js';
import { generateUUID } from '@/lib/utils/uuid';
import sql from '@/database/pgsql';
import { v4 as uuidv4 } from 'uuid';
import logger from '@/lib/logger';

function sanitizeFileName(raw: string): string {
    return raw.replace(/[\/\\]/g, '_').replace(/\.\./g, '_');
}

async function requireSession() {
    const session = await validateSession();
    if (!session) return null;
    return session;
}

export async function POST(request: NextRequest) {
    try {
        const session = await requireSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const limited = await checkRateLimit('upload', session.user_id);
        if (limited) return limited;

        const formData = await request.formData();
        const file = formData.get('file') as File;
        let noteId = formData.get('noteId') as string;

        if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

        const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 400 });
        }

        let createdNewNote = false;
        if (!noteId) {
            noteId = generateUUID();
            createdNewNote = true;

            const title = sanitizeFileName(file.name || 'unnamed');
            try {
                await sql`
                    INSERT INTO app.notes (note_id, user_id, title, content, is_folder, deleted, created_at, updated_at)
                    VALUES (${noteId}::uuid, ${session.user_id}::uuid, ${title}, '', false, 0, NOW(), NOW())
                `;
                await addNoteToTree(session.user_id, noteId, null);
            } catch (dbError) {
                logger.error('failed to create note for uploaded file', { error: dbError });
                return NextResponse.json({ error: 'Failed to create note for file' }, { status: 500 });
            }
        } else if (!isValidUUID(noteId)) {
            return NextResponse.json({ error: 'Invalid noteId format' }, { status: 400 });
        }

        const buffer = await file.arrayBuffer();
        const fileName = sanitizeFileName(file.name || 'unnamed');
        const storagePath = `notes/${noteId}/${fileName}`;

        const storage = getStorageProvider();
        await storage.putObject(storagePath, Buffer.from(buffer), {
            contentType: file.type || 'application/octet-stream'
        });

        const signedUrl = await storage.getSignUrl(storagePath, 3600);

        const attachmentId = uuidv4();
        try {
            await sql`
                INSERT INTO app.attachments (id, note_id, user_id, filename, s3_key, mime_type, file_size)
                VALUES (${attachmentId}::uuid, ${noteId}::uuid, ${session.user_id}::uuid,
                        ${fileName}, ${storagePath}, ${file.type || 'application/octet-stream'}, ${file.size})
            `;
        } catch (dbError) {
            logger.warn('failed to record attachment in database', { error: dbError });
        }

        if (createdNewNote) {
            try {
                await sql`
                    UPDATE app.notes SET s3_key = ${storagePath}, updated_at = NOW()
                    WHERE note_id = ${noteId}::uuid
                `;
            } catch (updateError) {
                logger.warn('failed to update note with s3_key', { error: updateError });
            }
        }

        return NextResponse.json({
            success: true, noteId, fileName, path: storagePath,
            url: signedUrl, size: file.size, type: file.type, attachmentId, createdNewNote,
        });
    } catch (error) {
        logger.error('upload error', { error });
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    try {
        const session = await requireSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const path = request.nextUrl.searchParams.get('path');
        if (!path) return NextResponse.json({ error: 'path query parameter required' }, { status: 400 });

        // verify the requested path belongs to this user via the attachments table
        const owned = await sql`
            SELECT 1 FROM app.attachments
            WHERE s3_key = ${path} AND user_id = ${session.user_id}::uuid
            LIMIT 1
        `;
        if (!owned.length) return NextResponse.json({ error: 'File not found' }, { status: 404 });

        const storage = getStorageProvider();
        const url = await storage.getSignUrl(path, 3600);
        return NextResponse.json({ success: true, path, url });
    } catch (error) {
        logger.error('retrieve error', { error });
        return NextResponse.json({ error: 'Retrieve failed' }, { status: 500 });
    }
}
