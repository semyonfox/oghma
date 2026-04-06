import type { StoreS3 } from "@/lib/storage/s3";

export type MarkerImages = Record<string, string>;

const MARKER_SPAN_RE = /<span\s+id="page-[^"]+"\s*><\/span>/g;
const MARKER_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
};

function inferImageMimeType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  return MIME_BY_EXT[ext] ?? "image/jpeg";
}

export function normalizeMarkerMarkdown(markdown: string): string {
  return markdown
    .replace(MARKER_SPAN_RE, "")
    .replace(/^\s{0,3}\{\d+\}-+\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sanitizeMarkerAssetName(name: string): string | null {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return null;

  const leaf = trimmed.split("/").pop()?.split("\\\\").pop() ?? "";
  if (!leaf) return null;

  const safe = leaf.replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!safe || safe === "." || safe === "..") return null;
  return safe;
}

export function markerAssetKey(
  userId: string,
  noteId: string,
  assetName: string,
): string {
  return `marker/${userId}/${noteId}/${assetName}`;
}

export function markerMetadataKey(userId: string, noteId: string): string {
  return markerAssetKey(userId, noteId, "_metadata.json");
}

interface PersistMarkerAssetsParams {
  storage: StoreS3;
  userId: string;
  noteId: string;
  markdown: string;
  images?: MarkerImages | null;
  metadata?: unknown;
}

interface PersistMarkerAssetsResult {
  markdown: string;
  imageCount: number;
}

export async function persistMarkerAssetsForNote({
  storage,
  userId,
  noteId,
  markdown,
  images,
  metadata,
}: PersistMarkerAssetsParams): Promise<PersistMarkerAssetsResult> {
  const imageEntries = Object.entries(images ?? {}).sort(([a], [b]) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );

  if (metadata != null) {
    await storage.putObject(
      markerMetadataKey(userId, noteId),
      JSON.stringify(metadata),
      { contentType: "application/json" },
    );
  }

  if (!imageEntries.length) {
    return { markdown, imageCount: 0 };
  }

  const rewrite = new Map<string, string>();
  let storedCount = 0;

  for (const [originalName, encoded] of imageEntries) {
    const safeName = sanitizeMarkerAssetName(originalName);
    if (!safeName || !encoded) continue;

    const key = markerAssetKey(userId, noteId, safeName);
    let bytes: Buffer;

    try {
      bytes = Buffer.from(encoded, "base64");
    } catch {
      continue;
    }

    if (!bytes.length) continue;

    await storage.putObject(key, bytes, {
      contentType: inferImageMimeType(safeName),
    });
    storedCount += 1;

    rewrite.set(originalName.trim(), safeName);
    rewrite.set(safeName, safeName);
  }

  const rewrittenMarkdown = markdown.replace(
    MARKER_IMAGE_RE,
    (full, altText: string, rawUrl: string) => {
      const cleaned = rawUrl.trim().replace(/^\.\//, "");
      const safeName = rewrite.get(cleaned);
      if (!safeName) return full;

      const url = `/api/notes/${noteId}/assets?name=${encodeURIComponent(safeName)}`;
      return `![${altText}](${url})`;
    },
  );

  return { markdown: rewrittenMarkdown, imageCount: storedCount };
}
