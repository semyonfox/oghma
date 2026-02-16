// upload API route - handles file uploads for note attachments
// coded but DISABLED until S3 storage is wired up
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    // TODO: enable when S3 storage is connected
    // implementation should:
    // 1. accept multipart form data with file
    // 2. upload to S3 bucket under note-specific prefix
    // 3. return { url: "signed-url-to-file" }
    return NextResponse.json(
        { error: 'Upload endpoint is not yet enabled. S3 storage must be configured first.' },
        { status: 501 }
    );
}
