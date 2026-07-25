"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowsPointingOutIcon,
  MinusIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { renderMermaidElement } from "../mermaid";

const VIEWPORT_PADDING = 16;
const MIN_VIEWPORT_HEIGHT = 96;
const MIN_ZOOM = 50;
const MAX_ZOOM = 200;
const ZOOM_STEP = 25;

interface Point {
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

export function mermaidFitScale(
  intrinsicWidth: number,
  availableWidth: number,
) {
  if (intrinsicWidth <= 0 || availableWidth <= 0) return 1;
  return Math.min(1, availableWidth / intrinsicWidth);
}

export function clampMermaidTranslation(
  translation: Point,
  viewport: Size,
  content: Size,
  padding = VIEWPORT_PADDING,
) {
  const usableWidth = Math.max(0, viewport.width - padding * 2);
  const usableHeight = Math.max(0, viewport.height - padding * 2);
  const x =
    content.width <= usableWidth
      ? padding + (usableWidth - content.width) / 2
      : Math.min(padding, Math.max(viewport.width - padding - content.width, translation.x));
  const y =
    content.height <= usableHeight
      ? padding + (usableHeight - content.height) / 2
      : Math.min(
          padding,
          Math.max(viewport.height - padding - content.height, translation.y),
        );
  return { x, y };
}

interface MermaidInlineViewerProps {
  source: string;
  onExpand: () => void;
}

export default function MermaidInlineViewer({
  source,
  onExpand,
}: MermaidInlineViewerProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const diagramRef = useRef<HTMLDivElement>(null);
  const dimensionsRef = useRef<Size | null>(null);
  const fitScaleRef = useRef(1);
  const zoomRef = useRef(100);
  const translationRef = useRef<Point>({ x: VIEWPORT_PADDING, y: VIEWPORT_PADDING });
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    translation: Point;
  } | null>(null);
  const lastWidthRef = useRef(0);
  const [zoom, setZoom] = useState(100);
  const [viewportHeight, setViewportHeight] = useState(MIN_VIEWPORT_HEIGHT);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [dragging, setDragging] = useState(false);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y } = translationRef.current;
    const scale = fitScaleRef.current * (zoomRef.current / 100);
    canvas.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
  }, []);

  const clampAndPaint = useCallback(
    (translation: Point) => {
      const viewport = viewportRef.current;
      const dimensions = dimensionsRef.current;
      if (!viewport || !dimensions) return;
      const scale = fitScaleRef.current * (zoomRef.current / 100);
      translationRef.current = clampMermaidTranslation(
        translation,
        { width: viewport.clientWidth, height: viewport.clientHeight },
        {
          width: dimensions.width * scale,
          height: dimensions.height * scale,
        },
      );
      paint();
    },
    [paint],
  );

  const layout = useCallback(() => {
    const viewport = viewportRef.current;
    const dimensions = dimensionsRef.current;
    if (!viewport || !dimensions || viewport.clientWidth <= 0) return;
    const availableWidth = Math.max(
      1,
      viewport.clientWidth - VIEWPORT_PADDING * 2,
    );
    const fitScale = mermaidFitScale(dimensions.width, availableWidth);
    fitScaleRef.current = fitScale;
    const height = Math.max(
      MIN_VIEWPORT_HEIGHT,
      dimensions.height * fitScale + VIEWPORT_PADDING * 2,
    );
    setViewportHeight(height);
    const scale = fitScale * (zoomRef.current / 100);
    translationRef.current = {
      x:
        VIEWPORT_PADDING +
        Math.max(0, (availableWidth - dimensions.width * scale) / 2),
      y: VIEWPORT_PADDING,
    };
    requestAnimationFrame(() => clampAndPaint(translationRef.current));
  }, [clampAndPaint]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    zoomRef.current = 100;
    setZoom(100);

    void renderMermaidElement(source)
      .then((diagram) => {
        if (!active || !diagramRef.current || !canvasRef.current) return;
        const viewBox = diagram
          .querySelector<SVGSVGElement>("svg")
          ?.getAttribute("viewBox")
          ?.trim()
          .split(/\s+/)
          .map(Number);
        const width = Number(viewBox?.[2]);
        const height = Number(viewBox?.[3]);
        if (!(width > 0) || !(height > 0)) {
          throw new Error("Mermaid SVG has no usable viewBox");
        }
        dimensionsRef.current = { width, height };
        diagram.style.width = `${width}px`;
        diagram.style.height = `${height}px`;
        canvasRef.current.style.width = `${width}px`;
        canvasRef.current.style.height = `${height}px`;
        diagramRef.current.replaceChildren(diagram);
        setLoading(false);
        requestAnimationFrame(layout);
      })
      .catch(() => {
        if (!active) return;
        setLoading(false);
        setFailed(true);
      });

    return () => {
      active = false;
    };
  }, [layout, source]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      if (Math.abs(width - lastWidthRef.current) < 1) return;
      lastWidthRef.current = width;
      layout();
    });
    observer.observe(shell);
    return () => observer.disconnect();
  }, [layout]);

  const changeZoom = (next: number) => {
    const bounded = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    const viewport = viewportRef.current;
    const dimensions = dimensionsRef.current;
    if (!viewport || !dimensions) return;
    const previousScale = fitScaleRef.current * (zoomRef.current / 100);
    const nextScale = fitScaleRef.current * (bounded / 100);
    const center = {
      x: viewport.clientWidth / 2,
      y: viewport.clientHeight / 2,
    };
    const previous = translationRef.current;
    zoomRef.current = bounded;
    setZoom(bounded);
    clampAndPaint({
      x: center.x - ((center.x - previous.x) * nextScale) / previousScale,
      y: center.y - ((center.y - previous.y) * nextScale) / previousScale,
    });
  };

  const stopDragging = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      ref={shellRef}
      className="oghma-mermaid-inline"
      contentEditable={false}
      suppressContentEditableWarning
    >
      <div
        className="oghma-mermaid-inline-toolbar"
        role="toolbar"
        aria-label="Diagram controls"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="oghma-mermaid-inline-zoom" role="group" aria-label="Zoom">
          <button
            type="button"
            onClick={() => changeZoom(zoom - ZOOM_STEP)}
            aria-label="Zoom diagram out"
            title="Zoom out"
            disabled={zoom === MIN_ZOOM}
          >
            <MinusIcon aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => changeZoom(100)}
            className="oghma-mermaid-inline-percent"
            aria-label="Reset diagram zoom"
            title="Reset zoom"
          >
            {zoom}%
          </button>
          <button
            type="button"
            onClick={() => changeZoom(zoom + ZOOM_STEP)}
            aria-label="Zoom diagram in"
            title="Zoom in"
            disabled={zoom === MAX_ZOOM}
          >
            <PlusIcon aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          onClick={onExpand}
          className="oghma-mermaid-inline-expand"
          aria-label="View diagram large"
          title="View large"
        >
          <ArrowsPointingOutIcon aria-hidden="true" />
        </button>
      </div>
      <div
        ref={viewportRef}
        className={`oghma-mermaid-inline-viewport${
          zoom > 100 ? " is-pannable" : ""
        }${dragging ? " is-dragging" : ""}`}
        style={{ height: `${viewportHeight}px` }}
        aria-label="Mermaid diagram preview"
        aria-busy={loading}
        tabIndex={0}
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse" || event.button !== 0 || zoom <= 100) {
            return;
          }
          event.preventDefault();
          dragRef.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            translation: { ...translationRef.current },
          };
          setDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          clampAndPaint({
            x: drag.translation.x + event.clientX - drag.x,
            y: drag.translation.y + event.clientY - drag.y,
          });
        }}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onWheel={(event) => {
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            changeZoom(zoom + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
            return;
          }
          if (zoom <= 100) return;
          event.preventDefault();
          clampAndPaint({
            x: translationRef.current.x - event.deltaX,
            y: translationRef.current.y - event.deltaY,
          });
        }}
      >
        <div ref={canvasRef} className="oghma-mermaid-inline-canvas">
          <div ref={diagramRef} />
        </div>
        {failed && (
          <p className="oghma-mermaid-inline-error">
            The diagram could not be rendered.
          </p>
        )}
      </div>
    </div>
  );
}
