// upload API route - handles file uploads for note attachments
import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { getStorageProvider } from '@/lib/storage/init';
import { isValidUUID } from '@/lib/uuid-validation';
import sql from '@/database/pgsql';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
    try {
        // Security: Authenticate user before allowing upload
        const session = await validateSession();
        if (!session) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const formData = await request.formData();
        const file = formData.get('file') as File;
        const noteId = formData.get('noteId') as string;

        // Validation: require valid noteId, no default 'test'
        if (!noteId || !isValidUUID(noteId)) {
            return NextResponse.json(
                { error: 'Valid noteId (UUID) is required' },
                { status: 400 }
            );
        }

        if (!file) {
            return NextResponse.json(
                { error: 'No file provided' },
                { status: 400 }
            );
        }

        const buffer = await file.arrayBuffer();
        const fileName = file.name || 'unnamed';
        const storagePath = `notes/${noteId}/${fileName}`;

        const storage = getStorageProvider();
        await storage.putObject(storagePath, Buffer.from(buffer), {
            contentType: file.type || 'application/octet-stream'
        });

        const signedUrl = await storage.getSignUrl(storagePath, 3600);

        // Record attachment in database
        const attachmentId = uuidv4();
        try {
            await sql`
                INSERT INTO app.attachments
                (id, note_id, user_id, filename, s3_key, mime_type, file_size)
                VALUES (
                    ${attachmentId}::uuid,
                    ${noteId}::uuid,
                    ${session.user_id}::uuid,
                    ${fileName},
                    ${storagePath},
                    ${file.type || 'application/octet-stream'},
                    ${file.size}
                )
            `;
        } catch (dbError) {
            console.error('Failed to record attachment in database:', dbError);
            // Don't fail the upload if DB insert fails, but log it
        }

        return NextResponse.json({
            success: true,
            fileName,
            path: storagePath,
            url: signedUrl,
            size: file.size,
            type: file.type,
            attachmentId,
        });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Upload failed' },
            { status: 500 }
        );
    }
}

export async function GET(request: NextRequest) {
    try {
        // Security: Authenticate user before allowing file retrieval
        const session = await validateSession();
        if (!session) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const path = request.nextUrl.searchParams.get('path');

        if (!path) {
            return NextResponse.json(
                { error: 'path query parameter required' },
                { status: 400 }
            );
        }

        const storage = getStorageProvider();
        const exists = await storage.hasObject(path);

        if (!exists) {
            return NextResponse.json(
                { error: 'File not found' },
                { status: 404 }
            );
        }

        const url = await storage.getSignUrl(path, 3600);

        return NextResponse.json({
            success: true,
            path,
            url,
        });
    } catch (error) {
        console.error('Retrieve error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Retrieve failed' },
            { status: 500 }
        );
    }
}
