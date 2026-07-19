"use client";

import MarkdownRenderer from "@/lib/markdown/renderer";
import useI18n from "@/lib/notes/hooks/use-i18n";

interface PreviewRendererProps {
  content: string;
  noteId?: string;
}

export default function PreviewRenderer({ content, noteId }: PreviewRendererProps) {
  const { t } = useI18n();
  return (
    <MarkdownRenderer
      variant="note"
      className="markdown-preview w-full max-w-none"
      components={{
        img: ({ node: _node, src, alt, ...props }) => {
          const rawSrc = typeof src === "string" ? src.trim() : "";
          const isAbsolute =
            rawSrc.startsWith("http://") ||
            rawSrc.startsWith("https://") ||
            rawSrc.startsWith("data:") ||
            rawSrc.startsWith("/");

          const resolvedSrc =
            !isAbsolute &&
            noteId &&
            /^_page_\d+_(?:Picture|Figure)_\d+\.(?:png|jpg|jpeg|webp|gif|bmp)$/i.test(
              rawSrc,
            )
              ? `/api/notes/${noteId}/assets?name=${encodeURIComponent(rawSrc)}`
              : rawSrc;

          return (
            <img
              {...props}
              src={resolvedSrc}
              alt={alt ?? ""}
              loading="lazy"
            />
          );
        },
      }}
    >
      {content || t("*No content*")}
    </MarkdownRenderer>
  );
}
