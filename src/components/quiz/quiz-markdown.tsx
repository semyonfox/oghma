"use client";

import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import MarkdownRenderer from "@/lib/markdown/renderer";

interface QuizMarkdownProps {
  children: string;
  className?: string;
}

export default function QuizMarkdown({ children, className }: QuizMarkdownProps) {
  return (
    <MarkdownRenderer
      className={className}
      remarkPlugins={[remarkMath]}
      rehypePlugins={[rehypeKatex, rehypeHighlight]}
      components={{
        p: ({ children }: any) => (
          <p className="mb-1.5 last:mb-0 leading-relaxed">{children}</p>
        ),
        ol: ({ children }: any) => (
          <ol className="list-decimal list-outside pl-4 space-y-1 my-1.5">
            {children}
          </ol>
        ),
        ul: ({ children }: any) => (
          <ul className="list-disc list-outside pl-4 space-y-1 my-1.5">
            {children}
          </ul>
        ),
        li: ({ children }: any) => <li className="leading-relaxed">{children}</li>,
        blockquote: ({ children }: any) => (
          <blockquote className="border-l-2 border-border-subtle pl-3 text-text-tertiary my-1.5 italic">
            {children}
          </blockquote>
        ),
      }}
    >
      {children}
    </MarkdownRenderer>
  );
}
