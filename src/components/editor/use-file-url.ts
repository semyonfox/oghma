'use client';

import { useEffect, useState } from 'react';

export function useFileUrl(sourcePath?: string) {
  const [url, setUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sourcePath) {
      setUrl('');
      return;
    }

    let cancelled = false;

    const loadUrl = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/upload?path=${encodeURIComponent(sourcePath)}`);
        if (!response.ok) {
          if (!cancelled) setUrl('');
          return;
        }

        const data = await response.json();
        if (!cancelled) {
          setUrl(data.url || '');
        }
      } catch {
        if (!cancelled) setUrl('');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadUrl();

    return () => {
      cancelled = true;
    };
  }, [sourcePath]);

  return { url, loading };
}
