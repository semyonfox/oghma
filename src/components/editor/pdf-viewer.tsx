"use client";

import {
  FC,
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
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

// A4 at 96 DPI used by PDF.js as its reference width.
const A4_WIDTH_PX = 794;
const A4_ASPECT_RATIO = Math.SQRT2;
const PAGE_OVERSCAN = "100% 0px";
export const MAX_PDF_DEVICE_PIXEL_RATIO = 2;

interface LazyPdfPageProps {
  pageNumber: number;
  fitMode: boolean;
  scale: number;
  containerWidth: number | null;
  scrollRoot: HTMLDivElement | null;
  devicePixelRatio: number;
  onRenderError: (error: Error) => void;
}

const LazyPdfPage: FC<LazyPdfPageProps> = ({
  pageNumber,
  fitMode,
  scale,
  containerWidth,
  scrollRoot,
  devicePixelRatio,
  onRenderError,
}) => {
  const slotRef = useRef<HTMLDivElement>(null);
  const [isNearViewport, setIsNearViewport] = useState(
    pageNumber <= 2 || !("IntersectionObserver" in window),
  );
  const [originalSize, setOriginalSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;

    if (!("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setIsNearViewport(entry.isIntersecting);
      },
      { root: scrollRoot, rootMargin: PAGE_OVERSCAN },
    );
    observer.observe(slot);
    return () => observer.disconnect();
  }, [scrollRoot]);

  const pageWidth =
    fitMode && containerWidth
      ? containerWidth
      : (originalSize?.width ?? A4_WIDTH_PX) * scale;
  const aspectRatio = originalSize
    ? originalSize.height / originalSize.width
    : A4_ASPECT_RATIO;

  return (
    <div
      ref={slotRef}
      data-pdf-page-number={pageNumber}
      className="flex justify-center"
      style={{ width: pageWidth, minHeight: pageWidth * aspectRatio }}
    >
      {isNearViewport ? (
        <Page
          pageNumber={pageNumber}
          scale={fitMode ? undefined : scale}
          width={fitMode && containerWidth ? containerWidth : undefined}
          devicePixelRatio={devicePixelRatio}
          renderTextLayer
          renderAnnotationLayer
          onLoadSuccess={(page) => {
            if (page.originalWidth > 0 && page.originalHeight > 0) {
              setOriginalSize({
                width: page.originalWidth,
                height: page.originalHeight,
              });
            }
          }}
          onRenderError={onRenderError}
        />
      ) : null}
    </div>
  );
};

const PDFViewer: FC<PDFViewerProps> = ({ file, pane: _pane }) => {
  const { t } = useI18n();
  const [numPages, setNumPages] = useState<number | null>(null);
  const [scale, setScale] = useState(1);
  const [fitMode, setFitMode] = useState(true);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const {
    data: pdfData,
    loading,
    error: urlError,
  } = usePdfCache(file.sourcePath, file.fileId);
  const pdfSource = useMemo(
    () => (pdfData ? { data: pdfData } : null),
    [pdfData],
  );

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
    ? Math.max(0.3, containerWidth / A4_WIDTH_PX)
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
    setScale((current) =>
      Math.min((fitMode ? fitScale : current) + 0.2, 3),
    );
    setFitMode(false);
  }, [fitMode, fitScale]);

  const handleZoomOut = useCallback(() => {
    setScale((current) =>
      Math.max((fitMode ? fitScale : current) - 0.2, 0.5),
    );
    setFitMode(false);
  }, [fitMode, fitScale]);

  // toggle fit: if already fitting, lock to current fit scale for manual zoom
  const handleFitToggle = useCallback(() => {
    setFitMode((was) => {
      if (was) setScale(fitScale);
      return !was;
    });
  }, [fitScale]);

  const displayScale = fitMode ? fitScale : scale;
  const devicePixelRatio = Math.min(
    window.devicePixelRatio || 1,
    MAX_PDF_DEVICE_PIXEL_RATIO,
  );

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Controls */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-border-subtle bg-background px-2 py-1 md:px-4 md:py-2">
        <div className="text-xs text-text-tertiary">
          {numPages
            ? t("pdf_viewer.page_count", { count: numPages })
            : t("Loading...")}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleFitToggle}
            title={fitMode ? t("Switch to manual zoom") : t("Fit to pane")}
            aria-label={fitMode ? t("Switch to manual zoom") : t("Fit to pane")}
            className={`flex h-10 w-10 items-center justify-center rounded transition-colors md:h-7 md:w-7 ${
              fitMode
                ? "bg-subtle text-text-secondary"
                : "text-text-tertiary hover:bg-subtle hover:text-text-secondary"
            }`}
          >
            <ArrowsPointingOutIcon className="w-4 h-4" />
          </button>

          <div className="w-px h-4 bg-border mx-0.5" />

          <button
            type="button"
            onClick={handleZoomOut}
            disabled={displayScale <= 0.5}
            title={t("Zoom out")}
            aria-label={t("Zoom out")}
            className="flex h-10 w-10 items-center justify-center rounded transition-colors hover:bg-subtle disabled:opacity-30 md:h-7 md:w-7"
          >
            <MagnifyingGlassMinusIcon className="w-4 h-4" />
          </button>

          <span className="text-xs text-text-tertiary min-w-10 text-center tabular-nums">
            {Math.round(displayScale * 100)}%
          </span>

          <button
            type="button"
            onClick={handleZoomIn}
            disabled={displayScale >= 3}
            title={t("Zoom in")}
            aria-label={t("Zoom in")}
            className="flex h-10 w-10 items-center justify-center rounded transition-colors hover:bg-subtle disabled:opacity-30 md:h-7 md:w-7"
          >
            <MagnifyingGlassPlusIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* PDF canvas — scrollable */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto bg-surface p-4"
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
        ) : !pdfSource ? (
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
            key={file.fileId}
            file={pdfSource}
            className="mx-auto w-max min-w-full"
            onLoadSuccess={onDocumentLoadSuccess}
            onItemClick={({ pageNumber }) => {
              scrollRef.current
                ?.querySelector(`[data-pdf-page-number="${pageNumber}"]`)
                ?.scrollIntoView({ block: "start" });
            }}
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
            <div className="flex flex-col items-center gap-4">
              {numPages &&
                Array.from({ length: numPages }, (_, i) => i + 1).map(
                  (pageNum) => (
                    <LazyPdfPage
                      key={pageNum}
                      pageNumber={pageNum}
                      fitMode={fitMode}
                      scale={scale}
                      containerWidth={containerWidth}
                      scrollRoot={scrollRef.current}
                      devicePixelRatio={devicePixelRatio}
                      onRenderError={handlePageRenderError}
                    />
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
