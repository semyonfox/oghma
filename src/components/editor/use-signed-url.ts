"use client";

import { useEffect, useState } from "react";
import { resolveStorageKey, resolveStreamUrl } from "./file-url";

/** Resolve an attachment (by storage key, or by note id) to a loadable URL. */
export function useSignedUrl(sourcePath?: string, fileId?: string) {
  const hasSource = Boolean(sourcePath || fileId);
  const [url, setUrl] = useState("");
  // start loading immediately if there's something to resolve
  const [loading, setLoading] = useState(hasSource);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setUrl("");
    if (!sourcePath && !fileId) {
      setLoading(false);
      setError("no-source");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const loadUrl = async () => {
      try {
        const key = await resolveStorageKey(sourcePath, fileId);
        if (cancelled) return;
        if ("error" in key) {
          setError(key.error);
          return;
        }
        const resolved = await resolveStreamUrl(key.value);
        if (cancelled) return;
        if ("error" in resolved) setError(resolved.error);
        else setUrl(resolved.value);
      } catch {
        if (!cancelled) setError("network");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadUrl();
    return () => {
      cancelled = true;
    };
  }, [sourcePath, fileId]);

  return { url, loading, error };
}
