"use client";

import { useEffect, useState } from "react";
import { getCacheEntry, putCacheEntry } from "./store";
import { runEviction } from "./evict";

interface UsePdfCacheResult {
  data: Uint8Array<ArrayBuffer> | null;
  loading: boolean;
  error: string | null;
}

// resolve the S3 key and a presigned URL — only called on cache miss
async function resolveSignedUrl(
  sourcePath?: string,
  fileId?: string,
): Promise<{ s3Key: string; signedUrl: string } | { error: string }> {
  let s3Key = sourcePath;

  if (!s3Key && fileId) {
    const noteRes = await fetch(`/api/notes/${fileId}?fields=s3Key,content`);
    if (!noteRes.ok) return { error: "note-fetch-failed" };
    const note = await noteRes.json();
    s3Key = note.s3Key || note.content || undefined;
  }

  if (!s3Key) return { error: "no-source" };

  const res = await fetch(`/api/upload?path=${encodeURIComponent(s3Key)}`);
  if (!res.ok) return { error: `http-${res.status}` };
  const data = await res.json();
  return { s3Key, signedUrl: data.url ?? "" };
}

export function usePdfCache(
  sourcePath?: string,
  fileId?: string,
): UsePdfCacheResult {
  const hasSource = !!(sourcePath || fileId);
  const [data, setData] = useState<Uint8Array<ArrayBuffer> | null>(null);
  const [loading, setLoading] = useState(hasSource);
  const [error, setError] = useState<string | null>(null);

  // Use the UUIDv7 fileId as a stable cache key when sourcePath is unavailable.
  const cacheKey = sourcePath ?? fileId ?? null;

  useEffect(() => {
    // loading is initialised as `hasSource` so it's already false when cacheKey is null
    if (!cacheKey) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      setData(null);

      try {
        // IndexedDB can be unavailable in an embedded browser. A cache failure
        // must not prevent the authenticated network request from loading the PDF.
        const cached = await getCacheEntry(cacheKey).catch(() => undefined);
        if (cached) {
          if (cancelled) return;
          setData(new Uint8Array(cached.buffer));
          setLoading(false);
          return; // zero API calls on cache hit
        }

        // cache miss — resolve signed URL and fetch bytes
        const resolved = await resolveSignedUrl(sourcePath, fileId);
        if (cancelled) return;

        if ("error" in resolved) {
          setError(resolved.error);
          setLoading(false);
          return;
        }

        const { s3Key, signedUrl } = resolved;
        const res = await fetch(signedUrl);
        if (!res.ok) {
          if (!cancelled) {
            setError(`http-${res.status}`);
            setLoading(false);
          }
          return;
        }

        const contentType =
          res.headers.get("Content-Type") ?? "application/pdf";
        const buffer = await res.arrayBuffer();
        if (cancelled) return;

        // PDF.js transfers typed arrays to its worker. Give it a copy so the
        // buffer retained by IndexedDB cannot be detached during the cache write.
        setData(new Uint8Array(buffer.slice(0)));
        setLoading(false);

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
        if (!cancelled) {
          setError("network");
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [cacheKey, sourcePath, fileId]);

  return { data, loading, error };
}
