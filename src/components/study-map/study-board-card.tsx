"use client";

import { memo, useEffect, useRef, useState } from "react";
import {
  AcademicCapIcon,
  DocumentTextIcon,
  LinkIcon,
  PencilSquareIcon,
  PhotoIcon,
  PresentationChartBarIcon,
} from "@heroicons/react/24/outline";
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
  if (!material.mimeType && /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(material.title)) {
    return "image";
  }
  return null;
}

function PdfPreview({ url, pageNumber = 1 }: { url: string; pageNumber?: number }) {
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
        <p className="px-3 text-center text-xs text-text-tertiary">Preview unavailable</p>
      ) : pdf ? (
        <pdf.Document
          file={url}
          suspense={false}
          loading={<p className="text-xs text-text-tertiary">Loading PDF...</p>}
          error={<p className="text-xs text-text-tertiary">Preview unavailable</p>}
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
            loading={<p className="text-xs text-text-tertiary">Rendering page...</p>}
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
        if (!response.ok || !response.body) throw new Error("SVG preview unavailable");
        if (Number(response.headers.get("Content-Length")) > MAX_SVG_PREVIEW_BYTES) {
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
        objectUrl = URL.createObjectURL(new Blob(chunks, { type: "image/svg+xml" }));
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
    return <p className="px-3 text-center text-xs text-text-tertiary">Preview unavailable. Open the original to read it.</p>;
  }
  if (!imageUrl) return <p className="text-xs text-text-tertiary">Loading preview...</p>;
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
    return <p className="px-3 text-center text-xs text-text-tertiary">Preview unavailable. Open the original to read it.</p>;
  }
  if (kind === "pdf") return <PdfPreview url={url} pageNumber={pageNumber} />;
  if (material.mimeType === "image/svg+xml" || (!material.mimeType && /\.svg$/i.test(material.title))) {
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
    .replace(/\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_match, target: string, label?: string) => label ?? target)
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
  if (item.assignment) return item.assignment.assignment_type === "quiz" ? "Quiz" : "Assignment";
  const material = item.material;
  if (!material) return "Material";
  if (item.kind === "pdf") return material.kind === "notes" || material.kind === "other" ? "PDF" : `${DOCUMENT_LABELS[material.kind]} · PDF`;
  if (item.kind === "image") return "Image";
  if (item.kind === "file") return "File";
  if (!material.imported) return "Your note";
  return DOCUMENT_LABELS[material.kind];
}

export function reviewNeeded(item: FlowItem): boolean {
  const material = item.material;
  if (!material) return false;
  return material.status === "stale" || material.status === "failed" || item.tags.some((tag) => tag.suggested);
}

function KindIcon({ item }: { item: FlowItem }) {
  const className = "h-3.5 w-3.5 shrink-0";
  if (item.kind === "assignment") return <AcademicCapIcon className={className} aria-hidden="true" />;
  if (item.kind === "image") return <PhotoIcon className={className} aria-hidden="true" />;
  if (item.kind === "pdf") return <PresentationChartBarIcon className={className} aria-hidden="true" />;
  if (item.material && !item.material.imported) return <PencilSquareIcon className={className} aria-hidden="true" />;
  return <DocumentTextIcon className={className} aria-hidden="true" />;
}

const dueFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

export interface StudyFlowCardProps {
  item: FlowItem;
  topics: Map<string, StudyTopic & { colour: string }>;
  linkCount: number;
  usedBy: Array<{ id: string; short: string; title: string }>;
  compact: boolean;
  pinned: boolean;
}

/** a fixed-size reference to a library note or assignment; the board never stores its content */
export const StudyFlowCard = memo(function StudyFlowCard({ item, topics, linkCount, usedBy, compact, pinned }: StudyFlowCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const preview = item.material ? previewKind(item.material) : null;
  const tags = item.tags.filter((tag) => topics.has(tag.topicId));
  const shown = tags.slice(0, 3);
  const primary = tags[0] ? topics.get(tags[0].topicId) : undefined;
  const assignment = item.assignment;
  const owned = item.material !== null && !item.material.imported && item.kind === "note";

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

  return (
    <div
      ref={cardRef}
      className={`flex h-full w-full flex-col overflow-hidden rounded-radius-lg border bg-surface px-3 pb-2.5 pt-2 font-sans text-text shadow-sm ${owned ? "border-dashed border-primary-500/40" : assignment ? "border-ai-500/50" : "border-border-subtle"}`}
      style={{ width: CARD_WIDTH, borderTopWidth: 3, borderTopStyle: "solid", borderTopColor: assignment ? "var(--color-ai-500)" : primary?.colour ?? "var(--color-border)" }}
    >
      <div className="flex min-w-0 items-center justify-between gap-2 text-xs text-text-tertiary">
        <span className="flex min-w-0 items-center gap-1.5">
          <KindIcon item={item} />
          <span className="truncate">{cardLabel(item)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {pinned && <span className="text-primary-600 dark:text-primary-300">Pinned</span>}
          {reviewNeeded(item) && (
            <span className="flex items-center gap-1 text-ai-700 dark:text-ai-300">
              <span className="h-1.5 w-1.5 rounded-full bg-ai-500" aria-hidden="true" />
              Review
            </span>
          )}
          {assignment?.due_at ? (
            <span className="rounded-full bg-ai-500/15 px-1.5 text-ai-800 dark:text-ai-200">Due {dueFormat.format(new Date(assignment.due_at))}</span>
          ) : (
            <span className="rounded-full bg-background px-1.5">{weekLabel(item)}</span>
          )}
        </span>
      </div>
      <h3 className={`mt-1 break-words font-semibold leading-snug ${compact ? "line-clamp-3 text-xl" : "line-clamp-2 text-sm"}`}>{item.title || "Untitled"}</h3>
      {!compact && (
        <>
          {preview && item.material ? (
            <div className="mt-1.5 flex h-[84px] items-center justify-center overflow-hidden rounded-radius-md border border-border-subtle bg-background">
              {visible ? <FilePreview key={`${item.material.noteId}:${item.material.currentHash}`} material={item.material} kind={preview} /> : <span className="text-xs text-text-tertiary">Preview</span>}
            </div>
          ) : (
            <p className="mt-1 line-clamp-3 break-words text-xs leading-relaxed text-text-secondary">
              {assignment ? readableExcerpt(assignment.description?.replace(/<[^>]+>/g, " ") ?? "") || "No brief has been imported." : readableExcerpt(item.material?.excerpt ?? "") || "Open the original to read it."}
            </p>
          )}
          <div className="mt-auto flex min-w-0 flex-wrap items-center gap-1 pt-1.5">
            {shown.map((tag) => {
              const topic = topics.get(tag.topicId)!;
              return (
                <button
                  key={tag.topicId}
                  type="button"
                  data-topic={tag.topicId}
                  className={`flex max-w-[9.5rem] items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] leading-none text-text-secondary hover:text-text ${tag.suggested ? "border-dashed border-ai-500/70" : "border-border-subtle"}`}
                  title={`${topic.name}: ${tag.relevance}${tag.suggested ? ", suggested, needs review" : tag.mentioned ? ", named in the brief" : ""}`}
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${tag.relevance === "core" ? "" : "border-2 bg-transparent"}`}
                    style={tag.relevance === "core" ? { background: topic.colour } : { borderColor: topic.colour }}
                    aria-hidden="true"
                  />
                  <span className="truncate">{topic.name}</span>
                </button>
              );
            })}
            {tags.length > shown.length && <span className="text-[11px] text-text-tertiary">+{tags.length - shown.length}</span>}
            {(linkCount > 0 || usedBy.length > 0) && (
              <span className="ml-auto flex items-center gap-1.5 text-[11px] text-text-tertiary">
                {linkCount > 0 && (
                  <span className="flex items-center gap-0.5" title={`${linkCount} linked ${linkCount === 1 ? "note" : "notes"}`}>
                    <LinkIcon className="h-3 w-3" aria-hidden="true" />
                    {linkCount}
                  </span>
                )}
                {usedBy.slice(0, 2).map((use) => (
                  <button key={use.id} type="button" data-go={`assignment:${use.id}`} className="rounded-full border border-ai-500/40 px-1.5 font-semibold text-ai-800 hover:bg-ai-500/10 dark:text-ai-200" title={`Used in ${use.title}`}>
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
