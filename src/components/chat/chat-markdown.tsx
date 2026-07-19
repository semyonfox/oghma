"use client";

import { memo } from "react";
import MarkdownRenderer from "@/lib/markdown/renderer";

function ChatMarkdown({ children }: { children: string }) {
  return (
    <MarkdownRenderer variant="chat">
      {children}
    </MarkdownRenderer>
  );
}

export default memo(ChatMarkdown);
