/*
 * Extract API Route — POST /api/extract
 * Ingestion pipeline for PDF documents
 * 1. Fetch PDF from S3 URL
 * 2. Parse text from PDF
 * 3. Split text into chunks
 * 4. Embed each chunk
 * 5. Store chunks and embeddings into postgres
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { chunkText } from '@/lib/chunking';
import { embedChunks } from '@/lib/embeddings';
import sql from '@/database/pgsql.js';

export async function POST(request: NextRequest) {
    const session = await validateSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { url, documentId } = await request.json();

    if (!url || !documentId) {
        return NextResponse.json({ error: 'url and documentId are required' }, { status: 400 });
    }

    try {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();

        const { PDFParse } = await import('pdf-parse');
        const parser = new PDFParse({});
        await parser.load(Buffer.from(buffer));
        const parsed = { text: await parser.getText() };

        const chunks = chunkText(parsed.text);
        const embeddings = await embedChunks(chunks);

        await Promise.all(
            embeddings.map(async ({ chunk, vector }) => {
                const [row] = await sql`
                    INSERT INTO app.chunks (document_id, user_id, text)
                    VALUES (${documentId}, ${(session as { user_id: string }).user_id}, ${chunk})
                    RETURNING id
                `;

                await sql`
                    INSERT INTO app.embeddings (chunk_id, embedding)
                    VALUES (${row.id}, ${JSON.stringify(vector)}::vector)
                `;
            })
        );

        return NextResponse.json({ success: true, chunksStored: chunks.length });
    } catch (error) {
        console.error('Error extracting PDF:', error);
        return NextResponse.json({ error: 'Failed to extract PDF' }, { status: 500 });
    }
}
