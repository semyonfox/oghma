"use client";

import { useEffect, useRef, useState } from "react";
import { renderMermaidElement } from "../mermaid";

interface MermaidBlockProps {
  code: string;
  title?: string;
}

export default function MermaidBlock({ code, title }: MermaidBlockProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);

    void renderMermaidElement(code)
      .then((preview) => {
        if (!active || !previewRef.current) return;
        previewRef.current.replaceChildren(preview);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
    };
  }, [code]);

  return (
    <figure className="oghma-mermaid-block">
      <figcaption className="oghma-mermaid-header">
        <span className="oghma-codeblock-dot" />
        <span>{title || "Mermaid diagram"}</span>
      </figcaption>
      {failed ? (
        <pre data-mermaid-state="fallback">
          <code className="language-mermaid">{code}</code>
        </pre>
      ) : (
        <div ref={previewRef} className="oghma-mermaid-preview" aria-busy="true" />
      )}
    </figure>
  );
}
