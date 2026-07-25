"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import {
  ArrowPathIcon,
  MinusIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { renderMermaidElement } from "../mermaid";

const MIN_ZOOM = 75;
const MAX_ZOOM = 300;
const ZOOM_STEP = 25;
export const MERMAID_FIT_ZOOM = 100;

export function nextMermaidZoom(zoom: number, direction: -1 | 1) {
  return Math.min(
    MAX_ZOOM,
    Math.max(MIN_ZOOM, zoom + direction * ZOOM_STEP),
  );
}

interface MermaidViewerDialogProps {
  open: boolean;
  source: string;
  title?: string;
  onClose: () => void;
}

export default function MermaidViewerDialog({
  open,
  source,
  title = "Mermaid diagram",
  onClose,
}: MermaidViewerDialogProps) {
  const diagramRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({
    active: false,
    x: 0,
    y: 0,
    left: 0,
    top: 0,
  });
  const [zoom, setZoom] = useState(MERMAID_FIT_ZOOM);
  const [dragging, setDragging] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  const resetView = () => {
    setZoom(MERMAID_FIT_ZOOM);
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
  };

  useEffect(() => {
    if (!open) return;
    let active = true;
    setFailed(false);
    setLoading(true);
    resetView();

    void renderMermaidElement(source)
      .then((diagram) => {
        if (!active || !diagramRef.current) return;
        diagramRef.current.replaceChildren(diagram);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setFailed(true);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, source]);

  const stopDragging = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} className="relative z-[80]">
      <DialogBackdrop className="fixed inset-0 bg-black/80 backdrop-blur-sm" />
      <div className="fixed inset-0 flex items-center justify-center p-2 sm:p-4">
        <DialogPanel
          className="flex h-[calc(100dvh-1rem)] w-full max-w-[100rem] flex-col overflow-hidden rounded-radius-lg border border-border-subtle bg-app-page shadow-2xl sm:h-[92dvh]"
          onKeyDown={(event) => {
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            if (event.key === "+" || event.key === "=") {
              event.preventDefault();
              setZoom((current) => nextMermaidZoom(current, 1));
            } else if (event.key === "-" || event.key === "_") {
              event.preventDefault();
              setZoom((current) => nextMermaidZoom(current, -1));
            } else if (event.key === "0") {
              event.preventDefault();
              resetView();
            }
          }}
        >
          <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border-subtle px-3 sm:px-4">
            <DialogTitle className="min-w-0 flex-1 truncate text-sm font-medium text-text-secondary">
              {title}
            </DialogTitle>
            <div className="flex items-center gap-1" aria-label="Diagram zoom controls">
              <button
                type="button"
                onClick={() => setZoom((current) => nextMermaidZoom(current, -1))}
                className="oghma-mermaid-viewer-button"
                aria-label="Zoom out"
                disabled={zoom === MIN_ZOOM}
              >
                <MinusIcon aria-hidden="true" />
              </button>
              <output
                className="w-12 text-center text-xs tabular-nums text-text-tertiary"
                aria-live="polite"
              >
                {zoom}%
              </output>
              <button
                type="button"
                onClick={() => setZoom((current) => nextMermaidZoom(current, 1))}
                className="oghma-mermaid-viewer-button"
                aria-label="Zoom in"
                disabled={zoom === MAX_ZOOM}
              >
                <PlusIcon aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={resetView}
                className="oghma-mermaid-viewer-button"
                aria-label="Fit diagram and reset position"
                title="Fit diagram and reset position"
              >
                <ArrowPathIcon aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="oghma-mermaid-viewer-button"
                aria-label="Close diagram viewer"
              >
                <XMarkIcon aria-hidden="true" />
              </button>
            </div>
          </div>
          <div
            ref={viewportRef}
            className={`oghma-mermaid-viewer-viewport${dragging ? " is-dragging" : ""}`}
            tabIndex={0}
            aria-label="Zoomed diagram. Scroll or drag to pan."
            onPointerDown={(event) => {
              if (event.pointerType !== "mouse" || event.button !== 0) return;
              event.preventDefault();
              const viewport = event.currentTarget;
              dragRef.current = {
                active: true,
                x: event.clientX,
                y: event.clientY,
                left: viewport.scrollLeft,
                top: viewport.scrollTop,
              };
              setDragging(true);
              viewport.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (!drag.active) return;
              event.currentTarget.scrollLeft =
                drag.left - (event.clientX - drag.x);
              event.currentTarget.scrollTop =
                drag.top - (event.clientY - drag.y);
            }}
            onPointerUp={stopDragging}
            onPointerCancel={stopDragging}
          >
            <div
              ref={diagramRef}
              className="oghma-mermaid-viewer-canvas"
              style={{ width: `${zoom}%` }}
              aria-busy={loading}
            />
            {failed && (
              <p className="p-6 text-sm text-text-tertiary">
                The diagram could not be rendered.
              </p>
            )}
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
