"use client";

import { useEffect, useState } from "react";
import { getCacheEntry, putCacheEntry } from "@/lib/notes/pdf-cache/store";
import { MAX_ENTRY_BYTES, runEviction } from "@/lib/notes/pdf-cache/evict";
import { resolveStorageKey, resolveStreamUrl } from "./file-url";

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

    const fail = (reason: string) => {
      if (cancelled) return;
      setError(reason);
      setLoading(false);
    };

    const load = async () => {
      setLoading(true);
      setError(null);
      setData(null);

      try {
        const key = await resolveStorageKey(sourcePath, fileId);
        if (cancelled) return;
        if ("error" in key) return fail(key.error);
        const s3Key = key.value;

        // IndexedDB can be unavailable in an embedded browser. A cache failure
        // must not prevent the authenticated network request from loading the PDF.
        const cached = await getCacheEntry(s3Key).catch(() => undefined);
        if (cancelled) return;
        if (cached) {
          setData(new Uint8Array(cached.buffer));
          setLoading(false);
          return;
        }

        const url = await resolveStreamUrl(s3Key);
        if (cancelled) return;
        if ("error" in url) return fail(url.error);

        const res = await fetch(url.value);
        if (!res.ok) return fail(`http-${res.status}`);

        const contentType =
          res.headers.get("Content-Type") ?? "application/pdf";
        const buffer = await res.arrayBuffer();
        if (cancelled) return;

        // PDF.js transfers typed arrays to its worker. Give it a copy so the
        // buffer retained by IndexedDB cannot be detached during the cache write.
        setData(new Uint8Array(buffer.slice(0)));
        setLoading(false);

        // a cached error page would be served on every later open, and an
        // oversized file would evict most of the cache to fit itself
        if (!looksLikePdf(buffer) || buffer.byteLength > MAX_ENTRY_BYTES) return;

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
      } catch {
        fail("network");
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [sourcePath, fileId]);

  return { data, loading, error };
}
