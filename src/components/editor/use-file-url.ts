'use client';

import { useEffect, useState } from 'react';

export function useFileUrl(sourcePath?: string, fileId?: string) {
  const hasAnything = !!(sourcePath || fileId);
  const [url, setUrl] = useState<string>('');
  // start loading immediately if there's something to resolve
  const [loading, setLoading] = useState(hasAnything);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sourcePath && !fileId) {
      setUrl('');
      setLoading(false);
      setError('no-source');
      return;
    }

    let cancelled = false;

    const loadUrl = async () => {
      setLoading(true);
      setError(null);

      let resolvedPath = sourcePath;

      // if sourcePath missing but we have fileId, fetch the note to get s3Key
      if (!resolvedPath && fileId) {
        try {
          const noteRes = await fetch(`/api/notes/${fileId}?fields=s3Key,content`);
          if (!noteRes.ok) {
            if (!cancelled) { setError('note-fetch-failed'); setLoading(false); }
            return;
          }
          const note = await noteRes.json();
          resolvedPath = note.s3Key || note.content || undefined;
        } catch {
          if (!cancelled) { setError('note-fetch-failed'); setLoading(false); }
          return;
        }
      }

      if (!resolvedPath) {
        if (!cancelled) { setError('no-source'); setLoading(false); }
        return;
      }

      try {
        const response = await fetch(`/api/upload?path=${encodeURIComponent(resolvedPath)}`);
        if (!response.ok) {
          if (!cancelled) { setUrl(''); setError(`http-${response.status}`); }
          return;
        }
        const data = await response.json();
        if (!cancelled) setUrl(data.url || '');
      } catch {
        if (!cancelled) { setUrl(''); setError('network'); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadUrl();
    return () => { cancelled = true; };
  }, [sourcePath, fileId]);

  return { url, loading, error };
}
