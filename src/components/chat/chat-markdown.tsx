"use client";

import MarkdownRenderer from "@/lib/markdown/renderer";
import { markdownSanitizeSchema } from "@/lib/markdown/sanitize-schema";
import remarkBreaks from "remark-breaks";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize from "rehype-sanitize";

export default function ChatMarkdown({ children }: { children: string }) {
  return (
    <MarkdownRenderer
      className="text-sm leading-relaxed"
      remarkPlugins={[remarkBreaks]}
      rehypePlugins={[rehypeHighlight, [rehypeSanitize, markdownSanitizeSchema]]}
      components={{
        p: ({ children }: any) => <p className="mb-2 last:mb-0">{children}</p>,
        h1: ({ children }: any) => (
          <h1 className="text-xl font-bold text-text mt-3 mb-1.5">{children}</h1>
        ),
        h2: ({ children }: any) => (
          <h2 className="text-lg font-bold text-text mt-3 mb-1">{children}</h2>
        ),
        h3: ({ children }: any) => (
          <h3 className="text-base font-semibold text-text mt-2 mb-1">{children}</h3>
        ),
        h4: ({ children }: any) => (
          <h4 className="font-medium text-text mt-2 mb-0.5">{children}</h4>
        ),
        blockquote: ({ children }: any) => (
          <blockquote className="border-l-2 border-primary-500/40 pl-3 my-2 text-text-tertiary italic">
            {children}
          </blockquote>
        ),
        ul: ({ children, className }: any) => (
          <ul
            className={[
              "list-disc list-outside pl-5 my-2 space-y-0.5 text-text",
              className,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {children}
          </ul>
        ),
        ol: ({ children, className }: any) => (
          <ol
            className={[
              "list-decimal list-outside pl-5 my-2 space-y-0.5 text-text",
              className,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {children}
          </ol>
        ),
        li: ({ children }: any) => (
          <li className="leading-relaxed">{children}</li>
        ),
        hr: () => <hr className="my-3 border-border-subtle" />,
        table: ({ children }: any) => (
          <div className="overflow-x-auto my-2">
            <table className="text-xs border-collapse w-full">{children}</table>
          </div>
        ),
        th: ({ children }: any) => (
          <th className="border border-border px-3 py-1.5 bg-surface font-semibold text-left text-text-secondary">
            {children}
          </th>
        ),
        td: ({ children }: any) => (
          <td className="border border-border px-3 py-1.5 text-text-secondary">
            {children}
          </td>
        ),
      }}
    >
      {children}
    </MarkdownRenderer>
  );
}
