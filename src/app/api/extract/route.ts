// extract API route — PDF ingestion pipeline
import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { chunkText } from '@/lib/chunking';
import { embedChunks } from '@/lib/embeddings';
import sql from '@/database/pgsql.js';
import { withErrorHandler } from '@/lib/api-error';
import { ApiError } from '@/lib/api-error';

function isAllowedUrl(raw: string): boolean {
    let parsed: URL;
    try { parsed = new URL(raw); } catch { return false; }
    if (parsed.protocol !== 'https:') return false;
    const h = parsed.hostname.toLowerCase();
    if (h === '169.254.169.254' || h === 'metadata.google.internal') return false;
    return !/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|localhost|::1|\[::1\])/.test(h);
}

async function storeChunkWithEmbedding(documentId: string, userId: string, chunk: string, vector: number[]) {
    const [row] = await sql`
        INSERT INTO app.chunks (document_id, user_id, text)
        VALUES (${documentId}, ${userId}, ${chunk})
        RETURNING id
    `;
    await sql`
        INSERT INTO app.embeddings (chunk_id, embedding)
        VALUES (${row.id}, ${JSON.stringify(vector)}::vector)
    `;
}

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await validateSession();
    if (!session) throw new ApiError(401, 'Unauthorized');

    const { url, documentId } = await request.json();
    if (!url || !documentId) throw new ApiError(400, 'url and documentId are required');
    if (!isAllowedUrl(url)) throw new ApiError(400, 'Invalid or disallowed URL');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: Buffer.from(await response.arrayBuffer()) });
    const { text } = await parser.getText();

    const chunks = chunkText(text);
    const embeddings = await embedChunks(chunks);
    const userId = (session as { user_id: string }).user_id;

    await Promise.all(
        embeddings.map(({ chunk, vector }) => storeChunkWithEmbedding(documentId, userId, chunk, vector))
    );

    return NextResponse.json({ success: true, chunksStored: chunks.length });
});
