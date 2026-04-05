"use client";

import { useEffect, useState, useRef } from "react";
import { getCacheEntry, putCacheEntry } from "./store";
import { runEviction } from "./evict";

interface UsePdfCacheResult {
  url: string;
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
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(hasSource);
  const [error, setError] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  // stable cache key — UUIDv7 fileId is fine when sourcePath isn't available
  const cacheKey = sourcePath ?? fileId ?? null;

  useEffect(() => {
    // loading is initialised as `hasSource` so it's already false when cacheKey is null
    if (!cacheKey) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        // check cache before touching the network
        const cached = await getCacheEntry(cacheKey);
        if (cached) {
          if (cancelled) return;
          const blob = new Blob([cached.buffer], { type: "application/pdf" });
          if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
          blobUrlRef.current = URL.createObjectURL(blob);
          setUrl(blobUrlRef.current);
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

        const buffer = await res.arrayBuffer();
        if (cancelled) return;

        const blob = new Blob([buffer], { type: "application/pdf" });
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = URL.createObjectURL(blob);
        setUrl(blobUrlRef.current);
        setLoading(false);

        // write to cache in the background — non-fatal
        putCacheEntry({
          s3Key,
          buffer,
          size: buffer.byteLength,
          cachedAt: Date.now(),
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

  // revoke blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  return { url, loading, error };
}
