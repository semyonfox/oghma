"use client";

import { useEffect, useState } from "react";
import { ArrowDownTrayIcon, DocumentIcon } from "@heroicons/react/24/outline";
import type { FileSpec } from "@/lib/notes/state/layout";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { useSignedUrl } from "./use-signed-url";

const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;

type Preview =
  | { status: "loading" }
  | { status: "ready"; text: string }
  | { status: "error" | "too-large" | "binary" };

async function readPreview(response: Response): Promise<Preview> {
  if (!response.ok || !response.body) return { status: "error" };
  const reader = response.body.getReader();
  try {
    if (Number(response.headers.get("content-length")) > MAX_PREVIEW_BYTES) {
      return { status: "too-large" };
    }
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0;
    let text = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_PREVIEW_BYTES) return { status: "too-large" };
      text += decoder.decode(chunk.value, { stream: true });
      if (text.includes("\0")) return { status: "binary" };
    }
    text += decoder.decode();
    return { status: "ready", text };
  } catch {
    return { status: "error" };
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export default function AttachmentViewer({ file }: { file: FileSpec }) {
  const { t } = useI18n();
  const { url, loading, error } = useSignedUrl(file.sourcePath, file.fileId);
  const [preview, setPreview] = useState<Preview>({ status: "loading" });

  useEffect(() => {
    if (!url || file.fileType !== "text") return;
    const controller = new AbortController();
    void fetch(url, { signal: controller.signal })
      .then(readPreview)
      .then((result) => {
        if (!controller.signal.aborted) setPreview(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setPreview({ status: "error" });
      });
    return () => controller.abort();
  }, [url, file.fileType]);

  let message: string | undefined;
  if (error || preview.status === "error") {
    message = t("attachment_viewer.unavailable");
  } else if (loading || (file.fileType === "text" && preview.status === "loading")) {
    message = t("Loading preview...");
  } else if (file.fileType === "attachment" || preview.status === "binary") {
    message = t("attachment_viewer.no_preview");
  } else if (preview.status === "too-large") {
    message = t("attachment_viewer.too_large");
  } else if (preview.status === "ready" && preview.text.length === 0) {
    message = t("attachment_viewer.empty");
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border-subtle px-4 py-2">
        <span className="text-xs text-text-tertiary">
          {t("attachment_viewer.original")}
        </span>
        {url && !error && (
          <a
            href={url}
            download={file.title || "download"}
            className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded px-3 py-2 text-sm text-text-secondary hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          >
            <ArrowDownTrayIcon className="h-4 w-4" aria-hidden="true" />
            {t("attachment_viewer.download")}
          </a>
        )}
      </div>
      {message ? (
        <div role="status" className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-text-tertiary">
          <DocumentIcon className="h-8 w-8" aria-hidden="true" />
          <p>{message}</p>
        </div>
      ) : preview.status === "ready" ? (
        <pre
          aria-label={t("attachment_viewer.content")}
          tabIndex={0}
          className="min-h-0 flex-1 overflow-auto p-6 font-mono text-sm leading-relaxed text-text-secondary"
        ><code>{preview.text}</code></pre>
      ) : null}
    </div>
  );
}
