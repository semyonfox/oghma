"use client";

import { FC, useState, useCallback, useRef, useEffect } from "react";
import { FileSpec } from "@/lib/notes/state/layout.zustand";
import { Document, Page, pdfjs } from "react-pdf";
import {
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  ArrowsPointingOutIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { usePdfCache } from "@/lib/notes/pdf-cache/use-pdf-cache";
import useI18n from "@/lib/notes/hooks/use-i18n";

import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.js";
}

interface PDFViewerProps {
  file: FileSpec;
  pane: "A" | "B";
}

// A4 at 96 DPI used by PDF.js as its reference width
const A4_WIDTH_PX = 794;
const SCROLL_PADDING = 32; // 16px each side

const PDFViewer: FC<PDFViewerProps> = ({ file, pane: _pane }) => {
  const { t } = useI18n();
  const [numPages, setNumPages] = useState<number | null>(null);
  const [scale, setScale] = useState(1);
  const [fitMode, setFitMode] = useState(true);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const {
    url: pdfPath,
    loading,
    error: urlError,
  } = usePdfCache(file.sourcePath, file.fileId);

  // keep containerWidth in sync with pane resizes
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setContainerWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fitScale = containerWidth
    ? Math.max(0.3, (containerWidth - SCROLL_PADDING) / A4_WIDTH_PX)
    : 1;

  const onDocumentLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
      setNumPages(numPages);
    },
    [],
  );

  const handlePageRenderError = useCallback((error: Error) => {
    const msg = error.message || "";
    if (
      !msg.includes("Worker task was terminated") &&
      !msg.includes("GlobalImageCache") &&
      !msg.includes("getOperatorList")
    ) {
      console.error("PDF rendering error:", error);
    }
  }, []);

  const handleZoomIn = useCallback(() => {
    setFitMode(false);
    setScale((s) => Math.min(s + 0.2, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setFitMode(false);
    setScale((s) => Math.max(s - 0.2, 0.5));
  }, []);

  // toggle fit: if already fitting, lock to current fit scale for manual zoom
  const handleFitToggle = useCallback(() => {
    setFitMode((was) => {
      if (was) setScale(fitScale);
      return !was;
    });
  }, [fitScale]);

  const displayScale = fitMode ? fitScale : scale;

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Controls */}
      <div className="flex-shrink-0 px-4 py-2 bg-background border-b border-border-subtle flex items-center justify-between">
        <div className="text-xs text-text-tertiary">
          {numPages
            ? t("pdf_viewer.page_count", { count: numPages })
            : t("Loading...")}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleFitToggle}
            title={fitMode ? t("Switch to manual zoom") : t("Fit to pane")}
            className={`p-1.5 rounded transition-colors ${
              fitMode
                ? "bg-subtle text-text-secondary"
                : "text-text-tertiary hover:bg-subtle hover:text-text-secondary"
            }`}
          >
            <ArrowsPointingOutIcon className="w-4 h-4" />
          </button>

          <div className="w-px h-4 bg-border mx-0.5" />

          <button
            onClick={handleZoomOut}
            className="p-1.5 rounded hover:bg-subtle disabled:opacity-30 transition-colors"
          >
            <MagnifyingGlassMinusIcon className="w-4 h-4" />
          </button>

          <span className="text-xs text-text-tertiary min-w-10 text-center tabular-nums">
            {Math.round(displayScale * 100)}%
          </span>

          <button
            onClick={handleZoomIn}
            className="p-1.5 rounded hover:bg-subtle disabled:opacity-30 transition-colors"
          >
            <MagnifyingGlassPlusIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* PDF canvas — scrollable */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto flex items-start justify-center bg-surface p-4"
      >
        {loading ? (
          <div className="flex flex-col items-center gap-3 mt-16">
            <ArrowPathIcon
              className="h-6 w-6 animate-spin text-text-tertiary"
              aria-hidden="true"
            />
            <span className="text-sm text-text-tertiary">
              {t("pdf_viewer.loading")}
            </span>
          </div>
        ) : !pdfPath ? (
          <div className="flex flex-col items-center gap-3 mt-16 text-center px-6">
            <ExclamationTriangleIcon
              className="h-8 w-8 text-red-400/60"
              aria-hidden="true"
            />
            <p className="text-sm text-red-400/80">{t("pdf_viewer.error")}</p>
            <p className="text-xs text-text-tertiary">
              {urlError === "http-404"
                ? t("File not found in storage.")
                : urlError === "no-source"
                  ? t("No file path attached to this note.")
                  : t("Could not load the file URL.")}
            </p>
          </div>
        ) : (
          <Document
            file={pdfPath}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={
              <div className="flex flex-col items-center gap-3 mt-16">
                <ArrowPathIcon
                  className="h-6 w-6 animate-spin text-text-tertiary"
                  aria-hidden="true"
                />
                <span className="text-sm text-text-tertiary">
                  {t("pdf_viewer.preparing")}
                </span>
              </div>
            }
            error={
              <div className="text-red-500 mt-16">{t("pdf_viewer.error")}</div>
            }
          >
            <div className="flex flex-col gap-4">
              {numPages &&
                Array.from({ length: numPages }, (_, i) => i + 1).map(
                  (pageNum) => (
                    <div key={pageNum} className="flex justify-center">
                      <Page
                        pageNumber={pageNum}
                        scale={fitMode ? undefined : scale}
                        width={
                          fitMode && containerWidth
                            ? containerWidth - SCROLL_PADDING
                            : undefined
                        }
                        renderTextLayer
                        renderAnnotationLayer
                        onRenderError={handlePageRenderError}
                      />
                    </div>
                  ),
                )}
            </div>
          </Document>
        )}
      </div>
    </div>
  );
};

export default PDFViewer;
