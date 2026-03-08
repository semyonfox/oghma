// upload API route - handles file uploads for note attachments
import { NextRequest, NextResponse } from 'next/server';
import { getStorageProvider } from '@/lib/storage/init';

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const noteId = formData.get('noteId') as string || 'test';

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
        await storage.putObject(storagePath, Buffer.from(buffer));

        const signedUrl = await storage.getSignUrl(storagePath, 3600);

        return NextResponse.json({
            success: true,
            fileName,
            path: storagePath,
            url: signedUrl,
            size: file.size,
            type: file.type,
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
