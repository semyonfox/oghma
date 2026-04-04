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

  // match useSignedUrl's initial loading state — false when there's nothing to load
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(!!(sourcePath || fileId));
  const [error, setError] = useState<string | null>(null);

  const cacheKey = sourcePath ?? fileId ?? null;

  // hold the active blob URL so we can revoke on unmount
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
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
          // revoke previous blob URL before creating a new one
          if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
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
          if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
          const objectUrl = URL.createObjectURL(blob);
          blobUrlRef.current = objectUrl;
          setUrl(objectUrl);
          setLoading(false);

          // write to cache and evict in the background — non-fatal
          putCacheEntry({
            s3Key: cacheKey,
            buffer,
            size: buffer.byteLength,
            cachedAt: Date.now(),
          })
            .then(() => runEviction())
            .catch(() => {});
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

  // revoke blob URL only on unmount
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
