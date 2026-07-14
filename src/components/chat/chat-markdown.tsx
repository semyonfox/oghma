"use client";

import MarkdownRenderer from "@/lib/markdown/renderer";

export default function ChatMarkdown({ children }: { children: string }) {
  return (
    <MarkdownRenderer variant="chat">
      {children}
    </MarkdownRenderer>
  );
}
