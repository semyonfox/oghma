"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useSignedUrl } from "@/components/editor/use-signed-url";
import { CARD_WIDTH, type FlowItem } from "@/lib/study-map/flow";
import type { StudyMaterial } from "@/lib/study-map/types";

type PdfModule = typeof import("react-pdf");
export type PreviewKind = "image" | "pdf";
const MAX_SVG_PREVIEW_BYTES = 5 * 1024 * 1024;

export function previewKind(material: StudyMaterial): PreviewKind | null {
  if (!material.isFile) return null;
  if (material.mimeType?.startsWith("image/")) return "image";
  if (material.mimeType === "application/pdf") return "pdf";
  if (!material.mimeType && /\.pdf$/i.test(material.title)) return "pdf";
  if (
    !material.mimeType &&
    /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(material.title)
  ) {
    return "image";
  }
  return null;
}

// loaded with the first preview so react-pdf stays out of the board bundle
function loadReactPdf() {
  return import("react-pdf");
}

function PdfPreview({
  url,
  pageNumber = 1,
}: {
  url: string;
  pageNumber?: number;
}) {
  const [pdf, setPdf] = useState<PdfModule | null>(null);
  const [failed, setFailed] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(1 / Math.SQRT2);
  const [size, setSize] = useState({ width: 160, height: 128 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void loadReactPdf().then(
      (module) => {
        if (cancelled) return;
        module.pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.js";
        setPdf(module);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      setSize({ width: container.clientWidth, height: container.clientHeight });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const width = Math.max(1, Math.min(size.width, size.height * aspectRatio));
  return (
    <div
      ref={containerRef}
      className="flex h-full w-full items-center justify-center overflow-hidden"
      aria-label={`Page ${pageNumber} preview`}
    >
      {failed ? (
        <p className="px-3 text-center text-xs text-text-tertiary">
          Preview unavailable
        </p>
      ) : pdf ? (
        <pdf.Document
          file={url}
          suspense={false}
          loading={<p className="text-xs text-text-tertiary">Loading PDF...</p>}
          error={
            <p className="text-xs text-text-tertiary">Preview unavailable</p>
          }
          onLoadError={() => setFailed(true)}
          className="flex items-center justify-center"
        >
          <pdf.Page
            pageNumber={pageNumber}
            suspense={false}
            width={width}
            devicePixelRatio={1}
            renderAnnotationLayer={false}
            renderTextLayer={false}
            loading={
              <p className="text-xs text-text-tertiary">Rendering page...</p>
            }
            onLoadSuccess={(page) => {
              if (page.originalWidth > 0 && page.originalHeight > 0) {
                setAspectRatio(page.originalWidth / page.originalHeight);
              }
            }}
            onLoadError={() => setFailed(true)}
            onRenderError={() => setFailed(true)}
          />
        </pdf.Document>
      ) : (
        <p className="text-xs text-text-tertiary">Loading PDF...</p>
      )}
    </div>
  );
}

function SvgPreview({ url, title }: { url: string; title: string }) {
  const [imageUrl, setImageUrl] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    let objectUrl = "";
    const load = async () => {
      const run = async () => {
        // the proxy downloads SVGs as octet-stream; keep their content inside an image element
        const response = await fetch(url, { signal: controller.signal });
        if (!mounted) return;
        if (!response.ok || !response.body)
          throw new Error("SVG preview unavailable");
        if (
          Number(response.headers.get("Content-Length")) > MAX_SVG_PREVIEW_BYTES
        ) {
          controller.abort();
          throw new Error("SVG preview is too large");
        }
        const reader = response.body.getReader();
        const chunks: BlobPart[] = [];
        let size = 0;
        const attempt = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > MAX_SVG_PREVIEW_BYTES) {
              controller.abort();
              await reader.cancel();
              throw new Error("SVG preview is too large");
            }
            chunks.push(new Uint8Array(value));
          }
        };
        await attempt()
          .finally(() => {
            reader.releaseLock();
          });
        if (!mounted) return;
        if (size === 0) throw new Error("SVG preview is empty");
        objectUrl = URL.createObjectURL(
          new Blob(chunks, { type: "image/svg+xml" }),
        );
        setImageUrl(objectUrl);
      };
      await run()
        .catch(() => {
          controller.abort();
          if (mounted) setFailed(true);
        });
    };
    void load();
    return () => {
      mounted = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (failed) {
    return (
      <p className="px-3 text-center text-xs text-text-tertiary">
        Preview unavailable. Open the original to read it.
      </p>
    );
  }
  if (!imageUrl)
    return <p className="text-xs text-text-tertiary">Loading preview...</p>;
  return (
    <img
      src={imageUrl}
      alt={`Preview of ${title || "attached image"}`}
      className="h-full w-full object-contain"
      decoding="async"
      onError={() => setFailed(true)}
      draggable={false}
    />
  );
}

export function FilePreview({
  material,
  kind,
  pageNumber,
}: {
  material: StudyMaterial;
  kind: PreviewKind;
  pageNumber?: number;
}) {
  const { url, loading, error } = useSignedUrl(undefined, material.noteId);
  const [imageFailed, setImageFailed] = useState(false);

  if (loading) {
    return <p className="text-xs text-text-tertiary">Loading preview...</p>;
  }
  if (error || !url || imageFailed) {
    return (
      <p className="px-3 text-center text-xs text-text-tertiary">
        Preview unavailable. Open the original to read it.
      </p>
    );
  }
  if (kind === "pdf") return <PdfPreview url={url} pageNumber={pageNumber} />;
  if (
    material.mimeType === "image/svg+xml" ||
    (!material.mimeType && /\.svg$/i.test(material.title))
  ) {
    return <SvgPreview key={url} url={url} title={material.title} />;
  }
  return (
    <img
      src={url}
      alt={`Preview of ${material.title || "attached image"}`}
      className="h-full w-full object-contain"
      loading="lazy"
      decoding="async"
      onError={() => setImageFailed(true)}
      draggable={false}
    />
  );
}

const DOCUMENT_LABELS: Record<StudyMaterial["kind"], string> = {
  notes: "Notes",
  slides: "Slides",
  syllabus: "Syllabus",
  past_paper: "Past paper",
  worked_example: "Worked example",
  reading: "Reading",
  other: "Material",
};

/** card excerpts show prose, not Markdown syntax */
export function readableExcerpt(text: string): string {
  return text
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(
      /\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g,
      (_match, target: string, label?: string) => label ?? target,
    )
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/\[Page \d+\]/gi, " ")
    .replace(/[*_`~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function weekLabel(item: FlowItem): string {
  if (item.week === null) return "No week";
  return `Week ${item.week}`;
}

export function cardLabel(item: FlowItem): string {
  if (item.assignment)
    return item.assignment.assignment_type === "quiz" ? "Quiz" : "Assignment";
  const material = item.material;
  if (!material) return "Material";
  if (item.kind === "pdf") {
    const base =
      material.kind === "notes" || material.kind === "other"
        ? "PDF"
        : `${DOCUMENT_LABELS[material.kind]} · PDF`;
    return item.textVersionId ? `${base} + Note` : base;
  }
  if (item.kind === "image") return "Image";
  if (item.kind === "file") return "File";
  if (!material.imported) return "Your note";
  return DOCUMENT_LABELS[material.kind];
}

function reviewNeeded(item: FlowItem): boolean {
  const material = item.material;
  if (!material) return false;
  return (
    material.status === "stale" ||
    material.status === "failed" ||
    item.tags.some((tag) => tag.suggested)
  );
}

const dueFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
});

export interface StudyFlowCardProps {
  item: FlowItem;
  compact: boolean;
  pinned: boolean;
}

/** a fixed-size reference to a library note or assignment; the board never stores its content */
// memo stays: cards render from a .map that changes on every drag and pan frame
export const StudyFlowCard = memo(function StudyFlowCard({
  item,
  compact,
  pinned,
}: StudyFlowCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const preview = item.material ? previewKind(item.material) : null;
  const assignment = item.assignment;
  const review = reviewNeeded(item);

  useEffect(() => {
    const card = cardRef.current;
    if (!card || !preview) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    // offscreen previews unmount so a large map does not keep every PDF page rendered
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setVisible(entry.isIntersecting);
    });
    observer.observe(card);
    return () => observer.disconnect();
  }, [preview]);

  const meta = assignment?.due_at
    ? `${cardLabel(item)} · Due ${dueFormat.format(new Date(assignment.due_at))}`
    : cardLabel(item);
  const reviewDot = review && (
    <span
      className="h-1.5 w-1.5 shrink-0 rounded-full bg-ai-500"
      title="Topics to review"
      aria-label="Topics to review"
    />
  );
  const copies = item.copies?.length ? (
    <span className="ml-auto shrink-0 rounded-full border border-[var(--study-glass-edge)] px-1.5 text-[10px] text-text-secondary">
      {item.copies.length + 1} copies
    </span>
  ) : null;
  // a page only shows up close, and only when the file has one. everything else stays glass
  if (preview && item.material && !compact) {
    return (
      <div
        ref={cardRef}
        className="study-card-page relative h-full w-full overflow-hidden rounded-radius-xl font-sans"
        style={{ width: CARD_WIDTH }}
      >
        <div className="flex h-full items-start justify-center overflow-hidden bg-white">
          {visible ? (
            <FilePreview
              key={`${item.material.noteId}:${item.material.currentHash}`}
              material={item.material}
              kind={preview}
            />
          ) : (
            <span className="pt-6 text-xs text-slate-500">Preview</span>
          )}
        </div>
        <div className="study-glass study-glass-caption absolute inset-x-1.5 bottom-1.5 rounded-radius-lg px-2.5 py-1.5 text-text">
          <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-text-secondary">
            <span className="truncate">{meta}</span>
            {pinned && <span className="sr-only">, pinned</span>}
            {reviewDot}
            {copies}
          </p>
          <h3 className="truncate text-sm font-semibold leading-snug">
            {item.title || "Untitled"}
          </h3>
        </div>
      </div>
    );
  }
  return (
    <div
      ref={cardRef}
      className="study-glass flex h-full w-full flex-col overflow-hidden rounded-radius-xl px-3.5 pb-3 pt-2.5 font-sans text-text"
      style={{ width: CARD_WIDTH }}
    >
      <p
        className={`flex min-w-0 items-center gap-1.5 text-[11px] ${assignment ? "text-ai-700 dark:text-ai-300" : "text-text-tertiary"}`}
      >
        <span className="truncate">{meta}</span>
        {pinned && <span className="sr-only">, pinned</span>}
        {reviewDot}
        {copies}
      </p>
      <h3
        className={`mt-0.5 break-words font-semibold leading-snug ${compact ? "line-clamp-3 text-xl" : "line-clamp-2 text-sm"}`}
      >
        {item.title || "Untitled"}
      </h3>
      {!compact && (
        <p className="mt-1 line-clamp-3 break-words text-xs leading-relaxed text-text-secondary">
          {assignment
            ? readableExcerpt(
                assignment.description?.replace(/<[^>]+>/g, " ") ?? "",
              ) || "No brief has been imported."
            : readableExcerpt(
                (item.material?.excerpt ?? "").replace(
                  /^\s*#\s+[^\n]*\n+/,
                  "",
                ),
              ) || "No preview"}
        </p>
      )}
    </div>
  );
});
