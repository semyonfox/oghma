// extract API route — document ingestion pipeline (manual upload)
// supports PDF, DOCX, PPTX (via Marker), and text/markdown (direct decode)
import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { chunkText } from "@/lib/chunking";
import { embedChunks } from "@/lib/embeddings";
import { extractWithMarker } from "@/lib/ocr";
import { stripMarkdown } from "@/lib/strip-markdown";
import sql from "@/database/pgsql.js";
import { withErrorHandler } from "@/lib/api-error";
import { ApiError } from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rateLimiter";
import { xraySubsegment } from "@/lib/xray";

function isAllowedUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const h = parsed.hostname.toLowerCase();
  if (h === "169.254.169.254" || h === "metadata.google.internal") return false;
  return !/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|localhost|::1|\[::1\])/.test(
    h,
  );
}

async function storeChunkWithEmbedding(
  documentId: string,
  userId: string,
  chunk: string,
  vector: number[],
) {
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
  if (!session) throw new ApiError(401, "Unauthorized");

  const userId = session.user_id;
  const limited = await checkRateLimit("extract", userId);
  if (limited) return limited;

  const { url, documentId } = await request.json();
  if (!url || !documentId)
    throw new ApiError(400, "url and documentId are required");
  if (!isAllowedUrl(url)) throw new ApiError(400, "Invalid or disallowed URL");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  const response = await fetch(url, { signal: controller.signal });
  clearTimeout(timeout);

  // reject files over 50MB before buffering into memory
  const contentLength = parseInt(
    response.headers.get("content-length") ?? "0",
    10,
  );
  if (contentLength > 50 * 1024 * 1024) {
    throw new ApiError(413, "File too large (max 50MB)");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 50 * 1024 * 1024) {
    throw new ApiError(413, "File too large (max 50MB)");
  }
  const filename = new URL(url).pathname.split("/").pop() ?? "document.pdf";
  const ext = filename.toLowerCase().split(".").pop();
  const isText = ext && ["md", "markdown", "txt"].includes(ext);

  let rawText: string;
  let chunks: string[];

  await xraySubsegment("document-extract", async () => {
    if (isText) {
      // text/markdown: decode directly, no OCR needed
      rawText = buffer.toString("utf-8");
      chunks = chunkText(rawText);
    } else {
      // binary docs (PDF, DOCX, PPTX): EC2 Marker (primary) → Datalab (fallback)
      const marker = await extractWithMarker(buffer, filename);
      rawText = marker.text;
      chunks = marker.chunks;
    }
  });

  // stripped text for PG full-text search (no markdown syntax noise)
  const cleanedText = stripMarkdown(rawText!);
  await sql`UPDATE app.notes SET extracted_text = ${cleanedText}, updated_at = NOW() WHERE note_id = ${documentId}::uuid AND user_id = ${userId}::uuid`;

  const embeddings = await xraySubsegment("embed-chunks", () =>
    embedChunks(chunks!),
  );

  await Promise.all(
    embeddings.map(({ chunk, vector }) =>
      storeChunkWithEmbedding(documentId, userId, chunk, vector),
    ),
  );

  return NextResponse.json({ success: true, chunksStored: embeddings.length });
});
