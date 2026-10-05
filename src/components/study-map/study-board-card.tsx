"use client";

import { memo, useEffect, useRef, useState } from "react";
import { LinkIcon } from "@heroicons/react/24/outline";
import { useSignedUrl } from "@/components/editor/use-signed-url";
import { CARD_WIDTH, type FlowItem } from "@/lib/study-map/flow";
import type { StudyMaterial, StudyTopic } from "@/lib/study-map/types";

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
    void import("react-pdf").then(
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
      try {
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
        try {
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
        } finally {
          reader.releaseLock();
        }
        if (!mounted) return;
        if (size === 0) throw new Error("SVG preview is empty");
        objectUrl = URL.createObjectURL(
          new Blob(chunks, { type: "image/svg+xml" }),
        );
        setImageUrl(objectUrl);
      } catch {
        controller.abort();
        if (mounted) setFailed(true);
      }
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
  if (item.kind === "pdf")
    return material.kind === "notes" || material.kind === "other"
      ? "PDF"
      : `${DOCUMENT_LABELS[material.kind]} · PDF`;
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
  topics: Map<string, StudyTopic & { colour: string }>;
  linkCount: number;
  usedBy: Array<{ id: string; short: string; title: string }>;
  compact: boolean;
  pinned: boolean;
}

/** a fixed-size reference to a library note or assignment; the board never stores its content */
export const StudyFlowCard = memo(function StudyFlowCard({
  item,
  topics,
  linkCount,
  usedBy,
  compact,
  pinned,
}: StudyFlowCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const preview = item.material ? previewKind(item.material) : null;
  const tags = item.tags.filter((tag) => topics.has(tag.topicId));
  const shown = tags.slice(0, 2);
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

  const meta = [
    cardLabel(item),
    assignment?.due_at
      ? `Due ${dueFormat.format(new Date(assignment.due_at))}`
      : weekLabel(item),
  ];
  return (
    <div
      ref={cardRef}
      className="flex h-full w-full flex-col overflow-hidden rounded-radius-lg bg-surface px-3.5 pb-3 pt-2.5 font-sans text-text shadow-[0_1px_2px_rgb(15_23_42/0.06),0_0_0_1px_var(--color-border-subtle)]"
      style={{ width: CARD_WIDTH }}
    >
      <p
        className={`flex min-w-0 items-center gap-1.5 text-[11px] ${assignment ? "text-ai-700 dark:text-ai-300" : "text-text-tertiary"}`}
      >
        <span className="truncate">{meta.join(" · ")}</span>
        {pinned && <span className="sr-only">, pinned</span>}
        {review && (
          <span
            className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-ai-500"
            title="Topics to review"
            aria-label="Topics to review"
          />
        )}
      </p>
      <h3
        className={`mt-0.5 break-words font-semibold leading-snug ${compact ? "line-clamp-3 text-xl" : "line-clamp-2 text-sm"}`}
      >
        {item.title || "Untitled"}
      </h3>
      {!compact && (
        <>
          {preview && item.material ? (
            <div className="mt-2 flex h-[84px] items-center justify-center overflow-hidden rounded-radius-md bg-background">
              {visible ? (
                <FilePreview
                  key={`${item.material.noteId}:${item.material.currentHash}`}
                  material={item.material}
                  kind={preview}
                />
              ) : (
                <span className="text-xs text-text-tertiary">Preview</span>
              )}
            </div>
          ) : (
            <p className="mt-1 line-clamp-2 break-words text-xs leading-relaxed text-text-secondary">
              {assignment
                ? readableExcerpt(
                    assignment.description?.replace(/<[^>]+>/g, " ") ?? "",
                  ) || "No brief has been imported."
                : readableExcerpt(
                    (item.material?.excerpt ?? "").replace(
                      /^\s*#\s+[^\n]*\n+/,
                      "",
                    ),
                  ) || "Open the original to read it."}
            </p>
          )}
          <div className="mt-auto flex min-w-0 items-center gap-2.5 pt-2 text-[11px] text-text-tertiary">
            {shown.map((tag) => {
              const topic = topics.get(tag.topicId)!;
              return (
                <button
                  key={tag.topicId}
                  type="button"
                  data-topic={tag.topicId}
                  className="flex min-w-0 items-center gap-1 hover:text-text"
                  title={`${topic.name}: ${tag.relevance}${tag.suggested ? ", suggested, needs review" : tag.mentioned ? ", named in the brief" : ""}`}
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{
                      background: topic.colour,
                      opacity: tag.relevance === "core" ? 1 : 0.45,
                    }}
                    aria-hidden="true"
                  />
                  <span className="truncate">{topic.name}</span>
                </button>
              );
            })}
            {tags.length > shown.length && (
              <span className="shrink-0">+{tags.length - shown.length}</span>
            )}
            {(linkCount > 0 || usedBy.length > 0) && (
              <span className="ml-auto flex shrink-0 items-center gap-2">
                {linkCount > 0 && (
                  <span
                    className="flex items-center gap-0.5"
                    title={`${linkCount} linked ${linkCount === 1 ? "note" : "notes"}`}
                  >
                    <LinkIcon className="h-3 w-3" aria-hidden="true" />
                    {linkCount}
                  </span>
                )}
                {usedBy.slice(0, 2).map((use) => (
                  <button
                    key={use.id}
                    type="button"
                    data-go={`assignment:${use.id}`}
                    className="hover:text-text"
                    title={`Used in ${use.title}`}
                  >
                    ↩ {use.short}
                  </button>
                ))}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
});
