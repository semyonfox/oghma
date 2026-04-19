"use client";

import { useState } from "react";
import { ClipboardDocumentIcon, CheckIcon } from "@heroicons/react/24/outline";

interface CodeBlockProps {
  language?: string;
  className?: string;
  children: React.ReactNode;
  /** raw text content for clipboard — extracted from children by the renderer */
  rawContent?: string;
}

export default function CodeBlock({
  language,
  className,
  children,
  rawContent,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text =
      rawContent ?? (typeof children === "string" ? children : "");
    if (!text || !navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // future: if (language === "mermaid") return <MermaidBlock>{children}</MermaidBlock>;
  // use dynamic(() => import("./mermaid-block"), { ssr: false }) to keep Mermaid's ~2MB out of the bundle

  return (
    <div className="relative group my-4 rounded-lg overflow-hidden border border-border-subtle">
      {language && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-surface border-b border-border-subtle">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-text-secondary">
            {language}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="opacity-0 group-hover:opacity-100 p-1 rounded text-text-tertiary hover:text-text-secondary transition-all"
            aria-label="Copy code"
            title={copied ? "Copied" : "Copy"}
          >
            {copied ? (
              <CheckIcon className="w-3.5 h-3.5 text-green-400" />
            ) : (
              <ClipboardDocumentIcon className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      )}
      <pre className={`overflow-x-auto ${className ?? ""}`}>{children}</pre>
    </div>
  );
}
