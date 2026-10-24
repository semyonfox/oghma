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

// memo stays: the compiler memoises per component, not per item of a .map,
// so without it every earlier part re-parses its markdown on each streamed token
export default memo(ChatMarkdown);
