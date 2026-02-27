// extract API route - unfurls URLs into metadata (title, description, image)
// coded but DISABLED until backend proxy/fetch service is ready
import { NextRequest, NextResponse } from 'next/server';
const pdfParse = require('pdf-parse');
import {chunkText} from "@/lib/chunking";
import {embedChunks} from '@/lib/embeddings';

export async function POST(request: NextRequest) {
    // TODO: enable when backend services are ready
    // implementation should:
    // 1. accept { url: string } in body
    // 2. fetch the URL server-side
    // 3. parse Open Graph / meta tags; NOTE: we are dealing with pdfs not web pages so we don't need to parse
    // 4. return embedding (chunks of text paired with vectors)

    const {url} = await request.json(); //holds url pointer to pdf text
    const response = await fetch(url) //fetchs the text pointer section of the url
    const buffer = await response.arrayBuffer(); //holds text in buffer

    const parsed = await pdfParse(Buffer.from(buffer)); //parses text(?)
    const chunks = chunkText(parsed.text);
    const embeddings = await embedChunks(chunks);

    return NextResponse.json({embeddings});
}