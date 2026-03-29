"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";

interface PreviewRendererProps {
  content: string;
}

export default function PreviewRenderer({ content }: PreviewRendererProps) {
  return (
    <div className="w-full prose prose-lg prose-invert max-w-none" dir="ltr">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeHighlight, rehypeRaw, rehypeSanitize]}
        components={{
          // Links rendered to open in new tabs for safety, styled with hover effects
          a: ({ node: _node, ...props }) => (
            <a
              {...props}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-400 hover:underline"
            />
          ),
          // custom code block styling
          code: ({ node: _node, className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || "");
            const isInline = !match;

            if (isInline) {
              return (
                <code
                  className="rounded bg-surface text-sm px-1.5 py-0.5 font-mono"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
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
          ul: ({ node: _node, children, ...props }) => (
            <ul
              className="list-disc list-outside pl-6 my-3 space-y-1 text-text"
              {...props}
            >
              {children}
            </ul>
          ),
          ol: ({ node: _node, children, ...props }) => (
            <ol
              className="list-decimal list-outside pl-6 my-3 space-y-1 text-text"
              {...props}
            >
              {children}
            </ol>
          ),
          li: ({ node: _node, children, ...props }) => (
            <li className="ml-1 leading-relaxed" {...props}>
              {children}
            </li>
          ),
        }}
      >
        {content || "*No content*"}
      </ReactMarkdown>
    </div>
  );
}
