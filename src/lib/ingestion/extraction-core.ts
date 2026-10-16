import type { PDFParse } from "pdf-parse";

import { chunkText } from "@/lib/rag/chunking";
import { markerOcrEnabled } from "@/lib/marker/config";
import { extractWithMarker } from "@/lib/marker/ocr";
import type { MarkerImages } from "@/lib/marker/output";

type ExtractionSource = "text" | "marker" | "pdf-parse" | "skipped";

export interface ExtractionResult {
  rawText: string;
  chunks: string[];
  source: ExtractionSource;
  markerImages?: MarkerImages;
  markerMetadata?: unknown;
  // page range marker was asked to extract; null/absent means full document
  pageRange?: string | null;
}

interface ExtractContentParams {
  buffer: Buffer;
  filename: string;
  mimeType?: string;
}

function isTextLikeFile(filename: string, mimeType?: string): boolean {
  if (mimeType?.startsWith("text/")) return true;
  const ext = filename.toLowerCase().split(".").pop();
  return Boolean(ext && ["md", "markdown", "txt"].includes(ext));
}

async function extractPdfTextLayer(
  buffer: Buffer,
): Promise<{ rawText: string; chunks: string[] } | null> {
  let parser: PDFParse | null = null;
  try {
    const pdfParse = await import("pdf-parse");
    parser = new pdfParse.PDFParse({ data: buffer });
    const result = await parser.getText();
    const rawText = (result?.text ?? "").trim();
    if (!rawText) return null;
    return { rawText, chunks: chunkText(rawText) };
  } catch {
    return null;
  } finally {
    // the long-lived worker parses every imported PDF; without this each
    // pdf.js document stays loaded
    await parser?.destroy().catch(() => {});
  }
}

export async function extractContentFromBuffer({
  buffer,
  filename,
  mimeType,
}: ExtractContentParams): Promise<ExtractionResult> {
  if (isTextLikeFile(filename, mimeType)) {
    const rawText = buffer.toString("utf-8");
    return { rawText, chunks: chunkText(rawText), source: "text" };
  }

  // Use the PDF text layer first. This is CPU-only and lets searchable PDFs
  // become RAG-ready without waiting for the optional OCR service.
  if (mimeType === "application/pdf") {
    const textLayer = await extractPdfTextLayer(buffer);
    if (textLayer) {
      return {
        rawText: textLayer.rawText,
        chunks: textLayer.chunks,
        source: "pdf-parse",
      };
    }
  }

  // the direct Marker server is an explicit fallback for scanned/image-only
  // documents. serverless Marker is queued by the caller on a skipped result
  if (process.env.MARKER_API_URL && markerOcrEnabled()) {
    const marker = await extractWithMarker(buffer, filename);
    return {
      rawText: marker.text,
      chunks: marker.chunks,
      source: "marker",
      markerImages: marker.images ?? {},
      markerMetadata: marker.metadata ?? null,
      pageRange: marker.pageRange,
    };
  }
  return { rawText: "", chunks: [], source: "skipped" };
}
