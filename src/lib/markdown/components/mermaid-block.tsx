"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowsPointingOutIcon } from "@heroicons/react/24/outline";
import { renderMermaidElement } from "../mermaid";
import MermaidViewerDialog from "./mermaid-viewer-dialog";

interface MermaidBlockProps {
  code: string;
  title?: string;
}

export default function MermaidBlock({ code, title }: MermaidBlockProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);

    void renderMermaidElement(code)
      .then((preview) => {
        if (!active || !previewRef.current) return;
        previewRef.current.replaceChildren(preview);
        previewRef.current.setAttribute("aria-busy", "false");
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
        <span className="min-w-0 flex-1 truncate">{title || "Mermaid diagram"}</span>
        <button
          type="button"
          onClick={() => setViewerOpen(true)}
          className="oghma-mermaid-expand-button"
          aria-label="View diagram large"
        >
          <ArrowsPointingOutIcon aria-hidden="true" />
        </button>
      </figcaption>
      {failed ? (
        <pre data-mermaid-state="fallback">
          <code className="language-mermaid">{code}</code>
        </pre>
      ) : (
        <div ref={previewRef} className="oghma-mermaid-preview" aria-busy="true" />
      )}
      <MermaidViewerDialog
        open={viewerOpen}
        source={code}
        title={title || "Mermaid diagram"}
        onClose={() => setViewerOpen(false)}
      />
    </figure>
  );
}
