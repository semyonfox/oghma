// export API route - exports notes as zip of markdown files
// coded but DISABLED until tree/storage are fully wired
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    // TODO: enable when tree + S3 storage are connected
    // implementation should:
    // 1. read all notes from tree
    // 2. fetch content from S3 for each
    // 3. build zip archive with folder structure matching tree
    // 4. stream zip as response
    return NextResponse.json(
        { error: 'Export endpoint is not yet enabled.' },
        { status: 501 }
    );
}

// import API route - imports zip of markdown files as notes
export async function POST(request: NextRequest) {
    // TODO: enable when tree + S3 storage are connected
    // implementation should:
    // 1. accept multipart form data with zip file
    // 2. extract markdown files
    // 3. create notes in tree + S3
    // 4. return { count: number } of imported notes
    return NextResponse.json(
        { error: 'Import endpoint is not yet enabled.' },
        { status: 501 }
    );
}
