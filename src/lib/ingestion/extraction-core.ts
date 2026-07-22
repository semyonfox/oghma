import { chunkText } from "@/lib/chunking";
import { extractWithMarker } from "@/lib/ocr";
import type { MarkerImages } from "@/lib/marker-output";

export type ExtractionSource = "text" | "marker" | "pdf-parse" | "skipped";

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

function markerOcrEnabled(): boolean {
  const value = process.env.MARKER_OCR_ENABLED?.trim().toLowerCase();
  return ["1", "true", "on"].includes(value ?? "");
}

async function extractPdfTextLayer(
  buffer: Buffer,
): Promise<{ rawText: string; chunks: string[] } | null> {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const rawText = (result?.text ?? "").trim();
    if (!rawText) return null;
    return { rawText, chunks: chunkText(rawText) };
  } catch {
    return null;
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

  // Marker is an explicit fallback for scanned/image-only documents.
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
