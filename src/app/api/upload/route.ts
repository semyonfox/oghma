// upload API route - handles file uploads for note attachments
import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimiter';
import { getStorageProvider } from '@/lib/storage/init';
import { isValidUUID } from '@/lib/uuid-validation';
import { addNoteToTree } from '@/lib/notes/storage/pg-tree.js';
import { generateUUID } from '@/lib/utils/uuid';
import { withErrorHandler, tracedError } from '@/lib/api-error';
import sql from '@/database/pgsql';
import { v4 as uuidv4 } from 'uuid';
import { xraySubsegment } from '@/lib/xray';
import logger from '@/lib/logger';
import { config } from '@/lib/config';

function sanitizeFileName(raw: string): string {
    return raw.replace(/[\/\\]/g, '_').replace(/\.\./g, '_');
}

const ALLOWED_MIME_TYPES = new Set([
    // documents
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/x-markdown',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    // images
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    // audio/video
    'audio/mpeg',
    'audio/wav',
    'video/mp4',
]);

async function requireSession() {
    const session = await validateSession();
    if (!session) return null;
    return session;
}

export const POST = withErrorHandler(async (request: NextRequest) => {
    try {
        const session = await requireSession();
        if (!session) return tracedError('Unauthorized', 401);

        const limited = await checkRateLimit('upload', session.user_id);
        if (limited) return limited;

        const formData = await request.formData();
        const file = formData.get('file') as File;
        let noteId = formData.get('noteId') as string;

        if (!file) return tracedError('No file provided', 400);

        if (file.size > config.upload.maxFileSizeBytes) {
            return tracedError(`File too large (max ${Math.round(config.upload.maxFileSizeBytes / 1024 / 1024)}MB)`, 400);
        }

        // validate file type against allowlist
        if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
            return tracedError(`File type '${file.type}' is not allowed`, 400);
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
                return tracedError('Failed to create note for file', 500);
            }
        } else if (!isValidUUID(noteId)) {
            return tracedError('Invalid noteId format', 400);
        }

        const buffer = await file.arrayBuffer();
        const fileName = sanitizeFileName(file.name || 'unnamed');
        const storagePath = `notes/${noteId}/${fileName}`;

        const storage = getStorageProvider();
        await xraySubsegment('s3-put', () =>
            storage.putObject(storagePath, Buffer.from(buffer), {
                contentType: file.type || 'application/octet-stream',
            })
        );

        const signedUrl = await xraySubsegment('s3-sign-url', () =>
            storage.getSignUrl(storagePath, 3600)
        );

        const attachmentId = uuidv4();
        try {
            await sql`
                INSERT INTO app.attachments (id, note_id, user_id, filename, s3_key, mime_type, file_size)
                VALUES (${attachmentId}::uuid, ${noteId}::uuid, ${session.user_id}::uuid,
                        ${fileName}, ${storagePath}, ${file.type || 'application/octet-stream'}, ${file.size})
            `;
        } catch (dbError) {
            logger.warn('failed to record attachment in database, cleaning up S3 object', { error: dbError });
            // clean up the orphaned S3 object since the DB record failed
            // if this also fails, the object will be caught by S3 lifecycle policy
            try { await storage.deleteObject(storagePath); }
            catch (s3Err) { logger.warn('failed to clean up orphaned S3 object', { key: storagePath, error: s3Err }); }
            return tracedError('Failed to save file metadata', 500);
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
        return tracedError('Upload failed', 500);
    }
});

export const GET = withErrorHandler(async (request: NextRequest) => {
    try {
        const session = await requireSession();
        if (!session) return tracedError('Unauthorized', 401);

        const path = request.nextUrl.searchParams.get('path');
        if (!path) return tracedError('path query parameter required', 400);

        // verify the requested path belongs to this user via the attachments table
        const owned = await sql`
            SELECT 1 FROM app.attachments
            WHERE s3_key = ${path} AND user_id = ${session.user_id}::uuid
            LIMIT 1
        `;
        if (!owned.length) return tracedError('File not found', 404);

        const storage = getStorageProvider();
        const url = await storage.getSignUrl(path, 3600);
        return NextResponse.json({ success: true, path, url });
    } catch (error) {
        logger.error('retrieve error', { error });
        return tracedError('Retrieve failed', 500);
    }
});
