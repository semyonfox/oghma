"use client";

import remarkBreaks from "remark-breaks";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import MarkdownRenderer from "@/lib/markdown/renderer";
import { markdownSanitizeSchema } from "@/lib/markdown/sanitize-schema";

interface PreviewRendererProps {
  content: string;
  noteId?: string;
}

export default function PreviewRenderer({ content, noteId }: PreviewRendererProps) {
  return (
    <MarkdownRenderer
      className="markdown-preview w-full prose prose-lg prose-invert max-w-none"
      remarkPlugins={[remarkBreaks]}
      rehypePlugins={[
        rehypeRaw,
        rehypeHighlight,
        [rehypeSanitize, markdownSanitizeSchema],
      ]}
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
        // custom heading anchors
        h1: ({ node: _node, children, ...props }) => (
          <h1 className="text-4xl font-bold mt-8 mb-4" {...props}>
            {children}
          </h1>
        ),
        h2: ({ node: _node, children, ...props }) => (
          <h2 className="text-3xl font-bold mt-6 mb-3" {...props}>
            {children}
          </h2>
        ),
        h3: ({ node: _node, children, ...props }) => (
          <h3 className="text-2xl font-bold mt-4 mb-2" {...props}>
            {children}
          </h3>
        ),
        // custom blockquote styling: consistent margins and dark mode support
        blockquote: ({ node: _node, children, ...props }) => (
          <blockquote
            className="border-l-4 border-primary-500 pl-4 italic my-4 text-text-secondary"
            {...props}
          >
            {children}
          </blockquote>
        ),
        // custom table styling
        table: ({ node: _node, children, ...props }) => (
          <div className="overflow-x-auto my-4">
            <table className="min-w-full border border-border" {...props}>
              {children}
            </table>
          </div>
        ),
        th: ({ node: _node, children, ...props }) => (
          <th
            className="border border-border px-4 py-2 bg-surface font-semibold text-left"
            {...props}
          >
            {children}
          </th>
        ),
        td: ({ node: _node, children, ...props }) => (
          <td className="border border-border px-4 py-2" {...props}>
            {children}
          </td>
        ),
        // explicit list styles — Tailwind base resets list-style-type by default
        ul: ({ node: _node, children, className, ...props }) => (
          <ul
            {...props}
            className={[
              "list-disc list-outside pl-6 my-3 space-y-1 text-text",
              className,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {children}
          </ul>
        ),
        ol: ({ node: _node, children, className, ...props }) => (
          <ol
            {...props}
            className={[
              "list-decimal list-outside pl-6 my-3 space-y-1 text-text",
              className,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {children}
          </ol>
        ),
        li: ({ node: _node, children, className, ...props }) => (
          <li
            {...props}
            className={["ml-1 leading-relaxed", className]
              .filter(Boolean)
              .join(" ")}
          >
            {children}
          </li>
        ),
        input: ({ node: _node, type, className, ...props }) => {
          if (type === "checkbox") {
            return (
              <input
                type="checkbox"
                {...props}
                className={["mr-2 align-middle accent-primary-500", className]
                  .filter(Boolean)
                  .join(" ")}
              />
            );
          }

          return <input type={type} {...props} className={className} />;
        },
      }}
    >
      {content || "*No content*"}
    </MarkdownRenderer>
  );
}
