"use client";

import { useEffect, useState } from "react";
import { getCacheEntry, putCacheEntry } from "@/lib/notes/pdf-cache/store";
import { MAX_ENTRY_BYTES, runEviction } from "@/lib/notes/pdf-cache/evict";
import { resolveStorageKey, resolveStreamUrl, type Resolved } from "./file-url";

interface UsePdfCacheResult {
  data: Uint8Array<ArrayBuffer> | null;
  loading: boolean;
  error: string | null;
}

/** PDF.js tolerates up to 1 KiB of junk before the header; so do we. */
export function looksLikePdf(buffer: ArrayBuffer): boolean {
  const head = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 1024));
  for (let index = 0; index + 4 < head.length; index += 1) {
    if (
      head[index] === 0x25 && // %
      head[index + 1] === 0x50 && // P
      head[index + 2] === 0x44 && // D
      head[index + 3] === 0x46 && // F
      head[index + 4] === 0x2d // -
    ) {
      return true;
    }
  }
  return false;
}

/**
 * The PDF's bytes, from IndexedDB when this browser has opened it before.
 * Shared by the PDF viewer and the study board page previews.
 */
export async function loadPdfBytes(
  sourcePath?: string,
  fileId?: string,
): Promise<Resolved<Uint8Array<ArrayBuffer>>> {
  const key = await resolveStorageKey(sourcePath, fileId);
  if ("error" in key) return key;
  const s3Key = key.value;

  // IndexedDB can be unavailable in an embedded browser. A cache failure
  // must not prevent the authenticated network request from loading the PDF.
  const cached = await getCacheEntry(s3Key).catch(() => undefined);
  if (cached) return { value: new Uint8Array(cached.buffer) };

  const url = await resolveStreamUrl(s3Key);
  if ("error" in url) return url;

  const res = await fetch(url.value);
  if (!res.ok) return { error: `http-${res.status}` };

  const contentType = res.headers.get("Content-Type") ?? "application/pdf";
  const buffer = await res.arrayBuffer();

  // a cached error page would be served on every later open, and an
  // oversized file would evict most of the cache to fit itself
  if (looksLikePdf(buffer) && buffer.byteLength <= MAX_ENTRY_BYTES) {
    // write to cache in the background — non-fatal
    putCacheEntry({
      s3Key,
      buffer,
      size: buffer.byteLength,
      cachedAt: Date.now(),
      contentType,
    })
      .then(() => runEviction())
      .catch(() => {});
  }

  // PDF.js transfers typed arrays to its worker. Give it a copy so the
  // buffer retained by IndexedDB cannot be detached during the cache write.
  return { value: new Uint8Array(buffer.slice(0)) };
}

export function usePdfCache(
  sourcePath?: string,
  fileId?: string,
): UsePdfCacheResult {
  const hasSource = !!(sourcePath || fileId);
  const [data, setData] = useState<Uint8Array<ArrayBuffer> | null>(null);
  const [loading, setLoading] = useState(hasSource);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // loading is initialised as `hasSource` so it's already false without one
    if (!sourcePath && !fileId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    void loadPdfBytes(sourcePath, fileId)
      .catch((): Resolved<Uint8Array<ArrayBuffer>> => ({ error: "network" }))
      .then((result) => {
        if (cancelled) return;
        if ("error" in result) setError(result.error);
        else setData(result.value);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sourcePath, fileId]);

  return { data, loading, error };
}
