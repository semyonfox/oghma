// document text extraction via Marker (supports PDF, DOCX, PPTX, images, etc.)
// tries Datalab hosted API first (free tier), falls back to self-hosted homelab on 429
// both use the same marker_server API contract: POST /marker/upload (multipart)
//
// returns structured output: full text + pre-split chunks that respect document structure
// (headings, tables, equations) — much better than naive sentence splitting

export interface MarkerResult {
    text: string;
    chunks: string[];
    source: 'datalab' | 'homelab' | 'pdf-parse';
}

const DATALAB_URL = 'https://api.datalab.to/api/v1/marker';
const REQUEST_TIMEOUT_MS = 120_000; // 2 min — large documents can take a while

const MIME_MAP: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ppt: 'application/vnd.ms-powerpoint',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
};

function mimeFromFilename(filename: string): string {
    const ext = filename.toLowerCase().split('.').pop() ?? '';
    return MIME_MAP[ext] ?? 'application/octet-stream';
}

export async function extractWithMarker(
    buffer: Buffer,
    filename: string,
): Promise<MarkerResult> {
    const datalabKey = process.env.DATALAB_API_KEY;
    const homelabUrl = process.env.MARKER_API_URL;

    // try datalab hosted API first
    if (datalabKey) {
        try {
            const result = await callMarker(DATALAB_URL, buffer, filename, {
                'X-Api-Key': datalabKey,
            });
            if (result) return { ...result, source: 'datalab' };
        } catch (err: any) {
            if (err?.status === 429) {
                console.log('Datalab rate-limited, falling back to homelab');
            } else {
                console.warn(`Datalab error: ${err?.message ?? err}`);
            }
        }
    }

    // fall back to self-hosted homelab via Cloudflare Tunnel
    if (homelabUrl) {
        const headers: Record<string, string> = {};
        const cfId = process.env.MARKER_CF_CLIENT_ID;
        const cfSecret = process.env.MARKER_CF_CLIENT_SECRET;
        if (cfId && cfSecret) {
            headers['CF-Access-Client-Id'] = cfId;
            headers['CF-Access-Client-Secret'] = cfSecret;
        }

        try {
            const result = await callMarker(
                `${homelabUrl}/marker/upload`,
                buffer,
                filename,
                headers,
            );
            if (result) return { ...result, source: 'homelab' };
        } catch (err: any) {
            console.warn(`Homelab Marker error: ${err?.message ?? err}`);
        }
    }

    // both unavailable — caller should fall back to pdf-parse
    throw new Error('Marker unavailable (both Datalab and homelab failed)');
}

async function callMarker(
    url: string,
    buffer: Buffer,
    filename: string,
    extraHeaders: Record<string, string>,
): Promise<{ text: string; chunks: string[] } | null> {
    const form = new FormData();
    const mime = mimeFromFilename(filename);
    form.append('file', new Blob([new Uint8Array(buffer)], { type: mime }), filename);
    form.append('output_format', 'markdown');
    form.append('force_ocr', 'false');
    form.append('paginate_output', 'true');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: extraHeaders,
            body: form,
            signal: controller.signal,
        });

        if (res.status === 429) {
            const err = new Error('Rate limited');
            (err as any).status = 429;
            throw err;
        }

        if (!res.ok) {
            throw new Error(`Marker API ${res.status}: ${(await res.text()).slice(0, 200)}`);
        }

        const json = await res.json();
        if (!json.success) throw new Error(json.error ?? 'Marker returned success=false');

        const text = typeof json.output === 'string' ? json.output : '';

        // split markdown on horizontal rules (page boundaries from paginate_output)
        // then further split on headings for chunk boundaries
        const chunks = splitMarkdownToChunks(text);

        return { text, chunks };
    } finally {
        clearTimeout(timeout);
    }
}

// splits marker's paginated markdown into semantic chunks
// respects page breaks (---) and headings (## / ###) as natural boundaries
function splitMarkdownToChunks(markdown: string, targetSize = 500): string[] {
    if (!markdown?.trim()) return [];

    // split on page boundaries first (Marker's paginate_output adds ---)
    const pages = markdown.split(/\n-{3,}\n/);
    const chunks: string[] = [];

    for (const page of pages) {
        // split each page on headings
        const sections = page.split(/(?=^#{1,3}\s)/m).filter(s => s.trim());

        let current = '';
        for (const section of sections) {
            if ((current + section).length > targetSize && current.trim()) {
                chunks.push(current.trim());
                current = section;
            } else {
                current += '\n' + section;
            }
        }
        if (current.trim()) chunks.push(current.trim());
    }

    return chunks;
}
