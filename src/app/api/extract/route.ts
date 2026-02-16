// extract API route - unfurls URLs into metadata (title, description, image)
// coded but DISABLED until backend proxy/fetch service is ready
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    // TODO: enable when backend services are ready
    // implementation should:
    // 1. accept { url: string } in body
    // 2. fetch the URL server-side
    // 3. parse Open Graph / meta tags
    // 4. return { title, description, image, url }
    return NextResponse.json(
        { error: 'Extract endpoint is not yet enabled.' },
        { status: 501 }
    );
}
