"use client";

import { useEffect, useState, useRef } from "react";
import { useSignedUrl } from "@/components/editor/use-signed-url";
import { getCacheEntry, putCacheEntry } from "./store";
import { runEviction } from "./evict";

interface UsePdfCacheResult {
  url: string;
  loading: boolean;
  error: string | null;
}

export function usePdfCache(
  sourcePath?: string,
  fileId?: string,
): UsePdfCacheResult {
  const { url: signedUrl, loading: urlLoading, error: urlError } = useSignedUrl(sourcePath, fileId);

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // track blob URL for cleanup
  const blobUrlRef = useRef<string | null>(null);

  // derive a stable cache key from sourcePath (the S3 key) or fall back to fileId
  const cacheKey = sourcePath ?? fileId ?? null;

  useEffect(() => {
    // mirror the "no source" error from useSignedUrl
    if (urlError === "no-source") {
      setUrl("");
      setLoading(false);
      setError("no-source");
      return;
    }

    if (urlLoading || (!signedUrl && !urlError)) return;

    if (urlError) {
      setUrl("");
      setLoading(false);
      setError(urlError);
      return;
    }

    if (!signedUrl || !cacheKey) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        // try cache first
        const cached = await getCacheEntry(cacheKey);
        if (cached && !cancelled) {
          const blob = new Blob([cached.buffer], { type: "application/pdf" });
          const objectUrl = URL.createObjectURL(blob);
          blobUrlRef.current = objectUrl;
          setUrl(objectUrl);
          setLoading(false);
          return;
        }

        // cache miss — fetch from S3
        const res = await fetch(signedUrl);
        if (!res.ok) {
          if (!cancelled) {
            setError(`http-${res.status}`);
            setLoading(false);
          }
          return;
        }

        const buffer = await res.arrayBuffer();

        if (!cancelled) {
          const blob = new Blob([buffer], { type: "application/pdf" });
          const objectUrl = URL.createObjectURL(blob);
          blobUrlRef.current = objectUrl;
          setUrl(objectUrl);
          setLoading(false);

          // write to cache and evict in the background
          putCacheEntry({
            s3Key: cacheKey,
            buffer,
            size: buffer.byteLength,
            cachedAt: Date.now(),
          })
            .then(() => runEviction())
            .catch(() => {
              // non-fatal — cache write failure doesn't break viewing
            });
        }
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
  }, [signedUrl, urlLoading, urlError, cacheKey]);

  // revoke blob URL when component unmounts or URL changes
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [url]);

  return { url, loading, error };
}
