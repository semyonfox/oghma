"use client";

import MarkdownRenderer from "@/lib/markdown/renderer";
import type { Components } from "react-markdown";

interface QuizMarkdownProps {
  children: string;
  className?: string;
}

const quizComponents: Partial<Components> = {
  p: ({ children }) => (
    <p className="mb-1.5 last:mb-0 leading-relaxed">{children}</p>
  ),
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
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-border-subtle pl-3 text-text-tertiary my-1.5 italic">
      {children}
    </blockquote>
  ),
};

export default function QuizMarkdown({ children, className }: QuizMarkdownProps) {
  return (
    <MarkdownRenderer
      variant="quiz"
      className={className}
      components={quizComponents}
    >
      {children}
    </MarkdownRenderer>
  );
}
