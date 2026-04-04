// extract API route — document ingestion pipeline
// The core logic is exported as runExtraction() so the worker can call it directly
// The HTTP POST handler remains for manual/admin triggers only
import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { chunkText } from "@/lib/chunking";
import { extractWithMarker } from "@/lib/ocr";
import { replaceNoteEmbeddings } from "@/lib/rag/indexing";
import { stripMarkdown } from "@/lib/strip-markdown";
import sql from "@/database/pgsql.js";
import { withErrorHandler } from "@/lib/api-error";
import { ApiError } from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rateLimiter";
import { xraySubsegment } from "@/lib/xray";
import { getStorageProvider } from "@/lib/storage/init";
import logger from "@/lib/logger";
import { enqueueExtractionRetry } from "@/lib/canvas/extraction-retry";

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
        INSERT INTO app.embeddings (chunk_id, user_id, embedding)
        VALUES (${row.id}, ${userId}, ${JSON.stringify(vector)}::vector)
    `;
}

export interface ExtractionResult {
  chunksStored: number;
}

/**
 * Core extraction logic — called by the ingestion worker.
 * Fetches the file from S3, extracts text, chunks, embeds, and stores.
 */
export async function runExtraction(
  documentId: string,
  userId: string,
  s3Key: string,
  mimeType: string,
): Promise<ExtractionResult> {
  const storage = getStorageProvider();

  // get a fresh signed URL (worker may have picked up the job after the
  // original upload URL has expired)
  const url = await storage.getSignUrl(s3Key, 1800);

  // fetch the file — no hard timeout here, the worker controls its own lifecycle
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch file from S3: ${response.status}`);
  }

  const contentLength = parseInt(
    response.headers.get("content-length") ?? "0",
    10,
  );
  if (contentLength > 50 * 1024 * 1024) {
    throw new Error("File too large (max 50MB)");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 50 * 1024 * 1024) {
    throw new Error("File too large (max 50MB)");
  }

  const filename = s3Key.split("/").pop() ?? "document.pdf";
  const ext = filename.toLowerCase().split(".").pop();
  const isText = ext && ["md", "markdown", "txt"].includes(ext);

  const { rawText, chunks } = await xraySubsegment(
    "document-extract",
    async () => {
      if (isText) {
        const text = buffer.toString("utf-8");
        return { rawText: text, chunks: chunkText(text) };
      }
      try {
        const marker = await extractWithMarker(buffer, filename);
        return { rawText: marker.text, chunks: marker.chunks };
      } catch (err) {
        logger.warn("Marker unavailable, falling back to pdf-parse", { err });

        // KNOWN LIMITATION: pdf-parse extracts embedded text only — NOT OCR.
        // Scanned/image-heavy PDFs return empty content until Marker retries.
        // A background SQS retry is queued so Marker re-processes once the
        // GPU is warm (~90s cold start with baked AMI).
        // TODO(team): add UI indicator "Processing with full OCR — check back shortly"
        //             when a note has pending marker status.

        // basic text extraction for digitally-created PDFs
        let basicText = "";
        try {
          const { PDFParse } = await import("pdf-parse");
          // PDFParse constructor takes { data: Buffer }
          const parser = new PDFParse({ data: buffer });
          const result = await parser.getText();
          basicText = result?.text ?? "";
        } catch (parseErr) {
          logger.warn("pdf-parse also failed", { parseErr });
        }

        // queue Marker retry via SQS (exponential backoff: 30s, 2m, 8m, 15m)
        enqueueExtractionRetry({
          noteId: documentId,
          userId,
          s3Key,
          filename,
          mimeType: mimeType ?? "application/pdf",
          parentFolderId: null,
          attempt: 0,
        }).catch((retryErr) => {
          logger.warn("Failed to enqueue Marker retry (non-fatal)", {
            retryErr,
          });
        });

        return { rawText: basicText, chunks: chunkText(basicText) };
      }
    },
  );

  const cleanedText = stripMarkdown(rawText);
  await sql`
        UPDATE app.notes
        SET extracted_text = ${cleanedText}, updated_at = NOW()
        WHERE note_id = ${documentId}::uuid AND user_id = ${userId}::uuid
    `;

  if (chunks.length === 0) {
    logger.warn("extraction produced no chunks", { documentId, s3Key });
    return { chunksStored: 0 };
  }

  const chunksStored = await xraySubsegment("replace-embeddings", () =>
    replaceNoteEmbeddings(documentId, userId, chunks),
  );

  return { chunksStored };
}

// HTTP handler — kept for manual/admin use, not called by normal upload flow
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

  const s3Key = new URL(url).pathname.replace(/^\//, "");
  const mimeType = "application/pdf";

  const result = await runExtraction(documentId, userId, s3Key, mimeType);
  return NextResponse.json({ success: true, ...result });
});
