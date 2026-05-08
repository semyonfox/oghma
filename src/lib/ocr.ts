// document text extraction via Marker server
// expects a MARKER_API_URL pointing at a marker_server (POST /marker/upload).
// when unset, callers fall back to pdf-parse (text layer only).
import { normalizeMarkerMarkdown } from "./marker-output";
import type { MarkerImages } from "./marker-output";

export class MarkerPendingError extends Error {
  constructor() {
    super("Marker did not respond within fast-path timeout");
    this.name = "MarkerPendingError";
  }
}

export interface MarkerResult {
  text: string;
  chunks: string[];
  images: MarkerImages;
  metadata: unknown;
  source: "marker";
}

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

const TOTAL_TIMEOUT_MS = parsePositiveIntEnv(
  "MARKER_REQUEST_TIMEOUT_MS",
  600_000,
);

const MARKER_FAST_PATH_MS = parsePositiveIntEnv("MARKER_FAST_PATH_MS", 5_000);

const MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

function mimeFromFilename(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  return MIME_MAP[ext] ?? "application/octet-stream";
}

export async function extractWithMarker(
  buffer: Buffer,
  filename: string,
  options: { fastPath?: boolean } = {},
): Promise<MarkerResult> {
  const markerUrl = process.env.MARKER_API_URL;
  if (!markerUrl) {
    throw new Error("Marker is not configured (set MARKER_API_URL)");
  }

  const timeoutMs = options.fastPath ? MARKER_FAST_PATH_MS : TOTAL_TIMEOUT_MS;
  const result = await callMarker(
    `${markerUrl}/marker/upload`,
    buffer,
    filename,
    timeoutMs,
    Boolean(options.fastPath),
  );
  if (!result) throw new Error("Marker returned no result");
  return { ...result, source: "marker" };
}

async function callMarker(
  url: string,
  buffer: Buffer,
  filename: string,
  timeoutMs: number,
  isFastPath: boolean,
): Promise<{
  text: string;
  chunks: string[];
  images: MarkerImages;
  metadata: unknown;
} | null> {
  const form = new FormData();
  const mime = mimeFromFilename(filename);
  const fileBytes = new Uint8Array(buffer.length);
  fileBytes.set(buffer);
  form.append("file", new Blob([fileBytes], { type: mime }), filename);
  form.append("output_format", "markdown");
  form.append("paginate_output", "false");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(
        `Marker ${res.status}: ${(await res.text()).slice(0, 200)}`,
      );
    }

    const json = await res.json();
    if (!json.success)
      throw new Error(json.error ?? "Marker returned success=false");

    const rawText = typeof json.output === "string" ? json.output : "";
    const text = normalizeMarkerMarkdown(rawText);
    const chunks = splitMarkdownToChunks(text);
    const images =
      json.images && typeof json.images === "object"
        ? (json.images as MarkerImages)
        : {};
    const metadata =
      json.metadata && typeof json.metadata === "object" ? json.metadata : null;
    return { text, chunks, images, metadata };
  } catch (err) {
    if (
      isFastPath &&
      (err as { name?: string })?.name === "AbortError"
    ) {
      throw new MarkerPendingError();
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export function splitMarkdownToChunks(
  markdown: string,
  targetSize = 500,
): string[] {
  if (!markdown?.trim()) return [];

  const pages = markdown.split(/\n-{3,}\n/);
  const chunks: string[] = [];

  for (const page of pages) {
    const sections = page.split(/(?=^#{1,3}\s)/m).filter((s) => s.trim());
    let current = "";
    for (const section of sections) {
      if ((current + section).length > targetSize && current.trim()) {
        chunks.push(current.trim());
        current = section;
      } else {
        current += "\n" + section;
      }
    }
    if (current.trim()) chunks.push(current.trim());
  }

  return chunks;
}
