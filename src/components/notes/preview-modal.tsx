"use client";

// preview modal - shows note preview on hover/click
// ported from Notea (MIT License) - MUI Popover replaced with Tailwind floating panel
import { FC, useEffect, useState } from "react";
import usePortalStore from "@/lib/notes/state/portal";
import Link from "next/link";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { removeMarkdown } from "@/lib/notes/utils/markdown";

interface PreviewNote {
  id: string;
  title: string;
  excerpt: string;
}

function parsePreview(id: string, value: unknown): PreviewNote | null {
  if (!value || typeof value !== "object") return null;
  const { title, content } = value as { title?: unknown; content?: unknown };
  return {
    id,
    title: typeof title === "string" ? title : "",
    excerpt: typeof content === "string" ? removeMarkdown(content).slice(0, 200) : "",
  };
}

const PreviewModal: FC = () => {
  const { t } = useI18n();
  const { preview } = usePortalStore();
  const previewId = preview.data?.id;
  const [previewNote, setPreviewNote] = useState<PreviewNote | null>(null);

  // the panel stays mounted, so repeated hovers over one link reuse the
  // last read; a different link aborts the older request
  useEffect(() => {
    if (!previewId || previewNote?.id === previewId) return;
    const controller = new AbortController();
    fetch(`/api/notes/${encodeURIComponent(previewId)}?fields=title,content`, {
      signal: controller.signal,
    })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((body: unknown) => {
        if (!controller.signal.aborted) setPreviewNote(parsePreview(previewId, body));
      })
      .catch(() => {});
    return () => controller.abort();
  }, [previewId, previewNote?.id]);

  if (!preview.visible || !previewId || !preview.anchor) {
    return null;
  }

  const current = previewNote?.id === previewId ? previewNote : null;
  const title = current?.title || t("Untitled");
  const content = current?.excerpt ?? "";

  // position relative to anchor element
  const rect = preview.anchor.getBoundingClientRect();
  const top = rect.bottom + 4;
  const left = Math.min(rect.left, window.innerWidth - 320);

  return (
    <div
      className="fixed z-50 w-72 max-h-48 bg-surface rounded-lg shadow-xl ring-1 ring-border-subtle overflow-hidden"
      style={{ top, left }}
      onMouseEnter={() => preview.cancelClose()}
      onMouseLeave={() => preview.close()}
    >
      <Link
        href={`/notes/${previewId}`}
        className="block p-3 hover:bg-subtle transition-colors"
        onClick={() => preview.close()}
      >
        <h4 className="text-sm font-medium text-text truncate mb-1">
          {title}
        </h4>
        {content && (
          <p className="text-xs text-text-tertiary line-clamp-3">{content}</p>
        )}
      </Link>
    </div>
  );
};

export default PreviewModal;
