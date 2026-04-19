import { chunkText } from "@/lib/chunking";
import { extractWithMarker } from "@/lib/ocr";
import type { MarkerImages } from "@/lib/marker-output";

export type ExtractionSource = "text" | "marker" | "pdf-parse";

export interface ExtractionResult {
  rawText: string;
  chunks: string[];
  source: ExtractionSource;
  markerImages?: MarkerImages;
  markerMetadata?: unknown;
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

  // CANVAS_SKIP_MARKER=true: bypass Marker entirely (e.g. ASG scaled to 0)
  // PDFs use pdf-parse text layer; other binaries are stored as attachments only
  if (process.env.CANVAS_SKIP_MARKER === "true") {
    if (mimeType === "application/pdf") {
      const fallback = await extractPdfTextLayer(buffer);
      if (fallback) {
        return { rawText: fallback.rawText, chunks: fallback.chunks, source: "pdf-parse" };
      }
    }
    return { rawText: "", chunks: [], source: "pdf-parse" };
  }

  try {
    const marker = await extractWithMarker(buffer, filename);
    return {
      rawText: marker.text,
      chunks: marker.chunks,
      source: "marker",
      markerImages: marker.images ?? {},
      markerMetadata: marker.metadata ?? null,
    };
  } catch (markerError) {
    // Keep fallback scoped to PDFs (text-layer only, not OCR).
    if (mimeType === "application/pdf") {
      const fallback = await extractPdfTextLayer(buffer);
      if (fallback) {
        return {
          rawText: fallback.rawText,
          chunks: fallback.chunks,
          source: "pdf-parse",
        };
      }
    }
    throw markerError;
  }
}
