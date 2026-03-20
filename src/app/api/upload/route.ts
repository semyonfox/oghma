// upload API route - handles file uploads for note attachments
import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { getStorageProvider } from '@/lib/storage/init';
import { isValidUUID } from '@/lib/uuid-validation';
import { addNoteToTree } from '@/lib/notes/storage/pg-tree.js';
import { generateUUID } from '@/lib/utils/uuid';
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
        let noteId = formData.get('noteId') as string;

        if (!file) {
            return NextResponse.json(
                { error: 'No file provided' },
                { status: 400 }
            );
        }

        // If no noteId provided, create a new note for this file
        let createdNewNote = false;
        if (!noteId) {
            noteId = generateUUID();
            createdNewNote = true;

            const fileName = file.name || 'unnamed';
            try {
                // Create a note for this uploaded file
                await sql`
                    INSERT INTO app.notes (
                        note_id, user_id, title, content, is_folder, deleted, created_at, updated_at
                    ) VALUES (
                        ${noteId}::uuid,
                        ${session.user_id}::uuid,
                        ${fileName},
                        '',
                        false,
                        0,
                        NOW(),
                        NOW()
                    )
                `;

                // Add to tree (root level)
                await addNoteToTree(session.user_id, noteId, null);
            } catch (dbError) {
                console.error('Failed to create note for uploaded file:', dbError);
                return NextResponse.json(
                    { error: 'Failed to create note for file' },
                    { status: 500 }
                );
            }
        } else if (!isValidUUID(noteId)) {
            return NextResponse.json(
                { error: 'Invalid noteId format' },
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

        // Update the note with the S3 key if we created it
        if (createdNewNote) {
            try {
                await sql`
                    UPDATE app.notes
                    SET s3_key = ${storagePath}, updated_at = NOW()
                    WHERE note_id = ${noteId}::uuid
                `;
            } catch (updateError) {
                console.error('Failed to update note with s3_key:', updateError);
            }
        }

        return NextResponse.json({
            success: true,
            noteId,
            fileName,
            path: storagePath,
            url: signedUrl,
            size: file.size,
            type: file.type,
            attachmentId,
            createdNewNote,
        });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json(
            { error: 'Upload failed' },
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
