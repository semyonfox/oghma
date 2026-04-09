"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";

interface QuizMarkdownProps {
  children: string;
  className?: string;
}

export default function QuizMarkdown({ children, className }: QuizMarkdownProps) {
  return (
    <div className={className}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex, rehypeHighlight]}
      components={{
        p: ({ children }) => (
          <p className="mb-1.5 last:mb-0 leading-relaxed">{children}</p>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-text">{children}</strong>
        ),
        em: ({ children }) => <em className="italic">{children}</em>,
        ol: ({ children }) => (
          <ol className="list-decimal list-outside pl-4 space-y-1 my-1.5">
            {children}
          </ol>
        ),
        ul: ({ children }) => (
          <ul className="list-disc list-outside pl-4 space-y-1 my-1.5">
            {children}
          </ul>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        pre: ({ children }) => (
          <pre className="bg-surface rounded-radius-sm p-3 overflow-x-auto my-2 text-xs leading-relaxed">
            {children}
          </pre>
        ),
        code: ({ children, className }) => {
          // inside a <pre> block — block code
          if (className) {
            return (
              <code className={`${className} font-mono text-xs`}>
                {children}
              </code>
            );
          }
          // inline code
          return (
            <code className="bg-surface px-1 py-0.5 rounded text-xs font-mono text-text-secondary">
              {children}
            </code>
          );
        },
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-border-subtle pl-3 text-text-tertiary my-1.5 italic">
            {children}
          </blockquote>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
    </div>
  );
}
